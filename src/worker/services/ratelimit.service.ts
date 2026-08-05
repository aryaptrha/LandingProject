import { sha256Hex } from '../utils/hash'

/**
 * Fixed-window rate limiter on top of KV.
 *
 * ## What this does and does not guarantee
 *
 * It is **best effort, not a hard ceiling**, and the design leans on that rather
 * than hiding it. Two properties of KV make an exact counter impossible here:
 *
 *   1. Writes are eventually consistent between colos, so a visitor hitting two
 *      Cloudflare locations inside one window can be counted against two
 *      independent views of the same key.
 *   2. Read-then-write is not atomic. Two simultaneous requests both read `n`
 *      and both write `n + 1`, so a burst undercounts.
 *
 * In exchange it costs one KV read and one KV write, needs no extra product, and
 * flattens the thing a guestbook actually suffers from: one person posting
 * twenty times in a row. A determined attacker with a script and a few IPs gets
 * through — which is why the limits that *must* hold (body size, field lengths,
 * the moderation switch) are enforced exactly, in code and in CHECK constraints,
 * and never delegated to this.
 *
 * If a hard guarantee is ever needed, the fix is a Durable Object keyed by
 * bucket — a single-threaded actor gives real atomicity. That is a bigger
 * dependency than this feature justifies today.
 */

/** Result of a limit check, shaped to fill RateLimit-* response headers. */
export interface RateLimitVerdict {
  allowed: boolean
  limit: number
  remaining: number
  /** Seconds until the current window rolls over. */
  resetSeconds: number
}

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number
  /** Window length in seconds. */
  windowSeconds: number
}

/**
 * Derives a rate-limit bucket from the client IP, hashed so the address itself
 * is never written down.
 *
 * `CF-Connecting-IP` is the only trustworthy source here — it is set by the edge
 * and cannot be spoofed by the client, unlike `X-Forwarded-For`. When it is
 * absent (local dev, or an unusual request) every caller collapses into one
 * shared `unknown` bucket, which is the safe direction to fail: shared limits
 * are stricter than none.
 *
 * The salt is domain separation, not a secret: it stops a hash computed here
 * from being compared against one computed elsewhere. Baked in rather than
 * configured, because rotating it would silently reset everyone's window.
 */
export async function ipBucket(request: Request): Promise<string> {
  const ip = request.headers.get('cf-connecting-ip')
  if (!ip) return 'unknown'

  return sha256Hex(`guestbook-rl:${ip}`)
}

/**
 * Counts one request against `bucket` and reports whether it may proceed.
 *
 * The window index is folded into the key, so an expired window is simply a key
 * nobody looks at again — there is no reset path to get wrong, and KV reclaims
 * it via `expirationTtl`.
 *
 * A KV outage fails **open**: a visitor who cannot be counted is let through
 * rather than blocked, because the cost of wrongly rejecting a real guestbook
 * post is higher than the cost of letting one extra through.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  bucket: string,
  { limit, windowSeconds }: RateLimitOptions,
): Promise<RateLimitVerdict> {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const windowIndex = Math.floor(nowSeconds / windowSeconds)
  const key = `rl:${bucket}:${windowIndex}`
  const resetSeconds = (windowIndex + 1) * windowSeconds - nowSeconds

  let used = 0

  try {
    const raw = await kv.get(key, 'text')
    if (raw !== null) {
      const parsed = Number.parseInt(raw, 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        used = parsed
      }
    }
  } catch (err) {
    console.error(`Rate limit read failed for ${key}:`, err)
    return { allowed: true, limit, remaining: limit, resetSeconds }
  }

  if (used >= limit) {
    return { allowed: false, limit, remaining: 0, resetSeconds }
  }

  try {
    // TTL covers the rest of this window plus a margin, so a clock skew between
    // colos cannot expire a window that is still in use.
    await kv.put(key, String(used + 1), {
      expirationTtl: Math.max(60, resetSeconds + windowSeconds),
    })
  } catch (err) {
    console.error(`Rate limit write failed for ${key}:`, err)
  }

  return { allowed: true, limit, remaining: Math.max(0, limit - (used + 1)), resetSeconds }
}

/** Standard headers so a client can back off without guessing. */
export function rateLimitHeaders(verdict: RateLimitVerdict): Record<string, string> {
  return {
    'RateLimit-Limit': String(verdict.limit),
    'RateLimit-Remaining': String(verdict.remaining),
    'RateLimit-Reset': String(verdict.resetSeconds),
  }
}
