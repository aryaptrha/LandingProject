import type { UpstreamPolicy } from './registry'

/**
 * Circuit breaker for outbound calls, backed by KV.
 *
 * ## What it is for
 *
 * When an upstream is down, the useful thing is not to keep asking. Every attempt
 * against a dead host costs the visitor the full timeout — 4s of a spinner to
 * arrive at the same failure the last request already established. Worse, on a
 * metered API a hard outage and a rejected key look identical from here, and
 * hammering either one is how a free-tier quota disappears in an afternoon.
 *
 * So after `failureThreshold` consecutive failures this trips open, and every
 * subsequent call returns immediately without touching the network until
 * `cooldownSeconds` has passed. The visitor gets a fast, honest "unavailable"
 * instead of a slow one, and the upstream gets room to recover.
 *
 * ## What it does not guarantee
 *
 * The same caveat as `services/ratelimit.service.ts`, for the same reasons, and
 * it is worth restating rather than cross-referencing: KV is eventually
 * consistent between colos, and read-then-write is not atomic. So the count is
 * approximate — two colos keep their own view of the same upstream, and a burst
 * of simultaneous failures can be recorded as one. What this gives is a
 * *dampener* on a sustained outage, which is the thing that actually hurts. It is
 * not a precise state machine, and nothing here should be read as one.
 *
 * A Durable Object keyed by upstream id would give real atomicity. That is the
 * upgrade path if this ever guards something where an exact count matters; for
 * keeping a weather panel from melting a quota, one KV read is the right price.
 *
 * ## Which way it fails
 *
 * Open on serving, quiet on counting. If KV is unreachable, `isOpen` reports
 * closed and the request proceeds: a cache/limiter outage must not become an
 * outage of the feature it was protecting. Write failures are logged and
 * swallowed for the same reason — the worst case is a breaker that forgets, which
 * degrades to the behaviour we had before it existed.
 */

/** Shape stored in KV. Kept small: it is read on every gated request. */
interface BreakerState {
  /** Consecutive failures observed. Reset to 0 by the first success. */
  failures: number
  /** Epoch ms until which the breaker is open, or 0 when it is closed. */
  openUntil: number
}

const CLOSED: BreakerState = { failures: 0, openUntil: 0 }

/** KV key for one upstream's breaker state. */
function breakerKey(id: string): string {
  return `gw:breaker:${id}`
}

/**
 * TTL for the stored state.
 *
 * Long enough to outlive the cooldown it is describing, short enough that a
 * forgotten failure count does not accumulate across an idle week and trip the
 * breaker on the first hiccup after it. Two cooldowns, floored at KV's 60s
 * minimum.
 */
function stateTtl(policy: UpstreamPolicy): number {
  return Math.max(60, policy.breaker.cooldownSeconds * 2)
}

async function readState(kv: KVNamespace, id: string): Promise<BreakerState> {
  try {
    const stored = await kv.get<BreakerState>(breakerKey(id), 'json')
    if (
      stored &&
      typeof stored.failures === 'number' &&
      typeof stored.openUntil === 'number'
    ) {
      return stored
    }
  } catch (err) {
    console.error(`Breaker read failed for ${id}:`, err)
  }
  return CLOSED
}

/**
 * Whether calls to `id` are currently short-circuited.
 *
 * Returns false — proceed — for a missing namespace, unreadable state, or an
 * expired cooldown. The expiry is checked here rather than relying on the KV TTL
 * so that a breaker whose cooldown has lapsed closes immediately, instead of
 * waiting for the key to age out.
 */
export async function isOpen(
  kv: KVNamespace | undefined,
  id: string,
): Promise<boolean> {
  if (!kv) return false
  const state = await readState(kv, id)
  return state.openUntil > Date.now()
}

/**
 * Clears the failure count after a call succeeds.
 *
 * Skips the write when there is nothing to clear, which is the overwhelmingly
 * common case — a healthy upstream should cost one KV read per request, not a
 * read and a write.
 */
export async function recordSuccess(
  kv: KVNamespace | undefined,
  id: string,
  policy: UpstreamPolicy,
): Promise<void> {
  if (!kv) return

  const state = await readState(kv, id)
  if (state.failures === 0 && state.openUntil === 0) return

  try {
    await kv.put(breakerKey(id), JSON.stringify(CLOSED), {
      expirationTtl: stateTtl(policy),
    })
  } catch (err) {
    console.error(`Breaker reset failed for ${id}:`, err)
  }
}

/**
 * Counts one failure, opening the breaker once the threshold is reached.
 *
 * The count keeps climbing past the threshold rather than resetting on trip, so a
 * probe that fails during the cooldown extends the outage window instead of
 * starting a fresh count from one.
 */
export async function recordFailure(
  kv: KVNamespace | undefined,
  id: string,
  policy: UpstreamPolicy,
): Promise<void> {
  if (!kv) return

  const state = await readState(kv, id)
  const failures = state.failures + 1
  const tripped = failures >= policy.breaker.failureThreshold

  const next: BreakerState = {
    failures,
    openUntil: tripped ? Date.now() + policy.breaker.cooldownSeconds * 1000 : 0,
  }

  if (tripped) {
    console.warn(
      `Breaker open for ${id}: ${failures} consecutive failures, ` +
        `holding ${policy.breaker.cooldownSeconds}s`,
    )
  }

  try {
    await kv.put(breakerKey(id), JSON.stringify(next), {
      expirationTtl: stateTtl(policy),
    })
  } catch (err) {
    console.error(`Breaker write failed for ${id}:`, err)
  }
}
