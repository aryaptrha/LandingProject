import { cacheKey } from '../services/kv.service'
import { isOpen, recordFailure, recordSuccess } from './breaker'
import { UPSTREAMS, type UpstreamId, type UpstreamPolicy } from './registry'

/**
 * The single door for outbound JSON calls to a third party.
 *
 * Before this existed, `routes/chat.ts` was the only code here that called out to
 * another service, and it did so with a bare `fetch`: no timeout (so a hung
 * upstream held the request open until the platform killed it), no retry, no
 * cache, and a `catch` that logged and carried on. That is survivable for one
 * optional feature. It is not a pattern to copy into a route that talks to a
 * metered API behind a secret key, which is what /api/weather is.
 *
 * So every concern that a route should not have to think about lives here:
 *
 *   - the origin allowlist, checked before a socket opens
 *   - one timeout per attempt, and a bounded retry for the failures a retry fixes
 *   - a read-through KV cache, so repeat callers never reach the network
 *   - a circuit breaker, so a dead upstream fails fast instead of slowly
 *   - credential injection, kept out of the cache key and out of the logs
 *
 * What is deliberately *not* here: building a `Response`. This returns a plain
 * result and the route decides the HTTP shape, so `utils/response.ts` remains the
 * only thing in the worker that knows what the success and error envelopes look
 * like. A gateway that also invented response bodies would be a second source of
 * truth for the API contract.
 *
 * Scope: JSON request/response only. A streaming upstream needs different
 * handling all the way down — no buffering, no caching, no decode — which is part
 * of why the persona backend has not moved in here yet (see `registry.ts`).
 */

/** Why a call failed, in terms a route can branch on. */
export type UpstreamFailure =
  /** Never left the worker: the URL's origin is not in the registry. */
  | 'BLOCKED'
  /** Attempt(s) exceeded `timeoutMs`, or the connection failed outright. */
  | 'TIMEOUT'
  /** Upstream answered, but with an error status or an undecodable body. */
  | 'UPSTREAM_ERROR'
  /** Breaker is open — no request was made at all. */
  | 'UPSTREAM_UNAVAILABLE'

export type UpstreamResult<T> =
  | {
      ok: true
      data: T
      /** True when KV answered and no network request was made. */
      cached: boolean
      /** Attempts spent, 1 when the first try worked. 0 on a cache hit. */
      attempts: number
      /** Wall-clock ms for the whole call, cache lookup included. */
      ms: number
    }
  | {
      ok: false
      reason: UpstreamFailure
      /**
       * Upstream's status when there was one, else 0. Passed through for logging
       * and for a route that wants to distinguish 401 from 503; it is *not* meant
       * to be forwarded to the browser verbatim, since it describes a hop the
       * client cannot see.
       */
      status: number
      /** Operator-facing detail. Safe to log, not written for end users. */
      message: string
      attempts: number
      ms: number
    }

export interface UpstreamOptions {
  /**
   * KV namespace backing the cache and the breaker. Optional because `CACHE` is
   * optional in `Env` — without it this still applies timeouts, retries and the
   * allowlist, just with no memory between requests.
   */
  kv?: KVNamespace | undefined
  /**
   * `ctx.waitUntil`, when the caller has it.
   *
   * Cache and breaker writes are bookkeeping: the visitor's answer is already in
   * hand and should not wait on a KV round trip. Passing this moves those writes
   * off the response path. Without it they are awaited, which is correct but
   * slower.
   */
  waitUntil?: ((promise: Promise<unknown>) => void) | undefined
  /**
   * Parts identifying this call for caching. Required to enable the cache.
   *
   * The URL is deliberately *not* used, and this is the most important detail in
   * the file: an upstream URL carries the credential (`?appid=...` for
   * OpenWeather), so hashing the URL would write a secret-derived value into KV
   * and rotating the key would silently orphan every cached entry. Callers pass
   * the parts that actually identify the *resource* — for weather, the coarsened
   * coordinates — and nothing else.
   *
   * Omit to skip the cache for one call while leaving the policy alone.
   */
  cacheParts?: string[] | undefined
  /** Passed through to `fetch`. `signal` is overwritten by the timeout. */
  init?: RequestInit | undefined
}

/** Base backoff between attempts, before jitter. */
const BACKOFF_BASE_MS = 150

/**
 * Whether another attempt could plausibly succeed.
 *
 * 429 is included on the assumption that the backoff below outlasts a very short
 * window; a sustained rate limit will exhaust the retries and then trip the
 * breaker, which is the right escalation. Every other 4xx is the upstream saying
 * the request itself is wrong — a bad key, a malformed query — and no number of
 * retries changes that answer.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/** Exponential backoff with jitter, so parallel callers do not retry in lockstep. */
function backoffMs(attempt: number): number {
  return BACKOFF_BASE_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 100)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Defers a write when `waitUntil` is available, awaits it otherwise. */
function settle(
  promise: Promise<unknown>,
  waitUntil: UpstreamOptions['waitUntil'],
): Promise<unknown> {
  if (waitUntil) {
    waitUntil(promise)
    return Promise.resolve()
  }
  return promise
}

/**
 * Cache read.
 *
 * Its own read/write pair rather than `cached()` from `services/kv.service.ts`,
 * which was a real choice and not an oversight. That helper wraps produce-on-miss
 * in one call and awaits its own put — both wrong here: the produce step has to be
 * observed by the breaker and by the retry loop, and the put has to be deferrable
 * through `waitUntil`. What is reused is `cacheKey()`, so a bump of
 * `CACHE_VERSION` orphans gateway entries along with everything else.
 */
async function readCache<T>(
  kv: KVNamespace | undefined,
  key: string | null,
): Promise<T | null> {
  if (!kv || !key) return null
  try {
    return await kv.get<T>(key, 'json')
  } catch (err) {
    console.error(`Gateway cache read failed for ${key}:`, err)
    return null
  }
}

async function writeCache(
  kv: KVNamespace | undefined,
  key: string | null,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  if (!kv || !key) return
  try {
    // 60s is KV's floor for expirationTtl; a policy below it would be rejected.
    await kv.put(key, JSON.stringify(value), {
      expirationTtl: Math.max(60, Math.floor(ttlSeconds)),
    })
  } catch (err) {
    console.error(`Gateway cache write failed for ${key}:`, err)
  }
}

/**
 * Calls `url` under the policy registered for `id`.
 *
 * `T` is asserted, not validated — `fetchUpstream` cannot know the upstream's
 * schema. Validating and narrowing the payload is the service layer's job, which
 * is where `weather.service.ts` picks fields explicitly rather than passing an
 * upstream shape through to the client.
 */
export async function fetchUpstream<T>(
  id: UpstreamId,
  url: string,
  options: UpstreamOptions = {},
): Promise<UpstreamResult<T>> {
  const policy: UpstreamPolicy = UPSTREAMS[id]
  const started = Date.now()
  const { kv, waitUntil } = options

  const elapsed = () => Date.now() - started

  // 1. Allowlist. Before the cache, so a blocked call is never answered from a
  //    previously cached one, and before the network by definition.
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return {
      ok: false,
      reason: 'BLOCKED',
      status: 0,
      message: `Malformed upstream URL for ${id}`,
      attempts: 0,
      ms: elapsed(),
    }
  }

  if (!policy.origin || target.origin !== policy.origin) {
    // Logs the origin, never the full URL — the query string holds the credential.
    const registered = policy.origin || '(none registered)'
    console.error(
      `Gateway blocked ${id}: origin ${target.origin} is not ${registered}`,
    )
    return {
      ok: false,
      reason: 'BLOCKED',
      status: 0,
      message: `Origin ${target.origin} is not registered for ${id}`,
      attempts: 0,
      ms: elapsed(),
    }
  }

  // 2. Cache. A hit costs one KV read and skips the breaker entirely: a cached
  //    answer is valid regardless of whether the upstream is currently reachable,
  //    and serving it during an outage is the point of having it.
  const key =
    policy.cacheTtlSeconds > 0 && options.cacheParts?.length
      ? cacheKey('gw', id, ...options.cacheParts)
      : null

  const hit = await readCache<T>(kv, key)
  if (hit !== null) {
    return { ok: true, data: hit, cached: true, attempts: 0, ms: elapsed() }
  }

  // 3. Breaker.
  if (await isOpen(kv, id)) {
    return {
      ok: false,
      reason: 'UPSTREAM_UNAVAILABLE',
      status: 0,
      message: `Breaker open for ${id}`,
      attempts: 0,
      ms: elapsed(),
    }
  }

  // 4. Attempt loop.
  const maxAttempts = policy.retries + 1
  let lastReason: UpstreamFailure = 'UPSTREAM_ERROR'
  let lastStatus = 0
  let lastMessage = `No attempt completed for ${id}`

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), policy.timeoutMs)

    try {
      const response = await fetch(target.toString(), {
        ...options.init,
        signal: controller.signal,
      })

      if (!response.ok) {
        lastStatus = response.status
        lastReason = 'UPSTREAM_ERROR'
        lastMessage = `${id} answered ${response.status}`

        if (isRetryableStatus(response.status) && attempt < maxAttempts) {
          await sleep(backoffMs(attempt))
          continue
        }
        break
      }

      // Decode inside the try: a 200 carrying HTML (a captive portal, an upstream
      // error page) is a failure of this call, not a success with odd data.
      const data = (await response.json()) as T

      await settle(recordSuccess(kv, id, policy), waitUntil)
      await settle(writeCache(kv, key, data, policy.cacheTtlSeconds), waitUntil)

      return { ok: true, data, cached: false, attempts: attempt, ms: elapsed() }
    } catch (err) {
      // An abort here is our own timeout firing — nothing else aborts this signal.
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      lastReason = aborted ? 'TIMEOUT' : 'UPSTREAM_ERROR'
      lastStatus = 0
      lastMessage = aborted
        ? `${id} exceeded ${policy.timeoutMs}ms`
        : `${id} request failed: ${err instanceof Error ? err.message : String(err)}`

      if (attempt < maxAttempts) {
        await sleep(backoffMs(attempt))
        continue
      }
    } finally {
      clearTimeout(timer)
    }
  }

  // Every attempt is spent. Count it once against the breaker — not once per
  // attempt, or a single unlucky request with retries would move the count by
  // more than one failure's worth.
  await settle(recordFailure(kv, id, policy), waitUntil)

  console.error(`Gateway failure for ${id}: ${lastMessage}`)

  return {
    ok: false,
    reason: lastReason,
    status: lastStatus,
    message: lastMessage,
    attempts: maxAttempts,
    ms: elapsed(),
  }
}
