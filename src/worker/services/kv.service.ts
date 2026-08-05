/**
 * Cache-aside layer over the KV namespace bound as `CACHE`.
 *
 * The rule for what belongs here: a value that is read far more often than it
 * changes and costs real work to produce. The `GROUP BY` aggregates qualify —
 * they scan the whole visit log on every page load of the insights panel. A
 * primary-key lookup does not, and putting one behind KV would add a network hop
 * to save nothing.
 *
 * KV is eventually consistent. A write is not guaranteed to be visible from
 * another colo immediately, which shapes two decisions elsewhere:
 *   - after a guestbook POST the client prepends the entry it just got back
 *     rather than refetching, so the author never sees their own post missing;
 *   - `invalidate()` is a best-effort hint, not a barrier. Every cached value
 *     also carries a TTL so a lost delete self-heals within seconds.
 */

/**
 * Prefix on every cache key.
 *
 * Bump this and every previously cached value is orphaned at once — the cheap
 * way to ship a shape change to a cached type without hunting down keys or
 * writing a purge script. Orphans expire on their own TTL.
 */
export const CACHE_VERSION = 'v1'

/**
 * KV rejects an `expirationTtl` below 60 seconds, so every TTL here is clamped
 * up to it. Worth knowing when tuning: 60s is the floor, not a default.
 */
const MIN_TTL_SECONDS = 60

/** Builds a namespaced cache key. */
export function cacheKey(...parts: string[]): string {
  return [CACHE_VERSION, ...parts].join(':')
}

/** Outcome of a cache-aside read, including whether KV served it. */
export interface CacheOutcome<T> {
  value: T
  /** True when KV answered, false when `produce()` had to run. */
  hit: boolean
}

/**
 * Returns the cached value for `key`, or produces, stores, and returns a fresh
 * one.
 *
 * A KV failure is never fatal: if the namespace is unreachable or holds
 * unparseable JSON, this falls through to `produce()` and answers from D1. The
 * cache is an optimisation, and an optimisation that can take the page down is a
 * liability.
 */
export async function cached<T>(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<CacheOutcome<T>> {
  try {
    const stored = await kv.get<T>(key, 'json')
    if (stored !== null) {
      return { value: stored, hit: true }
    }
  } catch (err) {
    // Log and fall through to D1 rather than failing the request.
    console.error(`KV read failed for ${key}:`, err)
  }

  const value = await produce()

  try {
    await kv.put(key, JSON.stringify(value), {
      expirationTtl: Math.max(MIN_TTL_SECONDS, Math.floor(ttlSeconds)),
    })
  } catch (err) {
    console.error(`KV write failed for ${key}:`, err)
  }

  return { value, hit: false }
}

/**
 * Drops cached keys after a write.
 *
 * Deletes rather than overwrites: recomputing on the next read is simpler than
 * keeping a write path and a read path in agreement about the cached shape, and
 * the next reader pays a single D1 query for it.
 *
 * Failures are swallowed by design — a guestbook post must not fail because a
 * cache delete did. The TTL on each key is the backstop.
 */
export async function invalidate(kv: KVNamespace, keys: string[]): Promise<void> {
  await Promise.all(
    keys.map(async (key) => {
      try {
        await kv.delete(key)
      } catch (err) {
        console.error(`KV delete failed for ${key}:`, err)
      }
    }),
  )
}
