import type { InsightsData } from '../types/data'
import { readBuckets, readScalar } from '../utils/d1'
import type { GeoSnapshot } from './edge.service'
import { touchSession } from './session.service'

/**
 * Visit logging and the aggregates built from it.
 *
 * This is the half of the feature that shows what D1 and KV are each good at.
 * D1 keeps the append-only history, because "how many people visited in the last
 * day, and from where" is a question you cannot answer from a counter. KV keeps
 * two things in front of it: a short-lived marker that stops the log filling up
 * with duplicates, and the computed aggregate so repeat page loads never touch
 * the database at all.
 */

/**
 * How long one session's visit counts as "already logged".
 *
 * The widget on the front end polls `/api/visitor` every 60 seconds, so without
 * this the visit log would gain a row per minute per open tab and every
 * aggregate would measure tab-hours instead of visits. Thirty minutes is the
 * usual session-window convention: leave and come back later and it counts
 * again, refresh twice and it does not.
 *
 * This is the one place KV's eventual consistency is a feature rather than a
 * caveat — a missed marker costs one duplicate row, which the aggregates absorb.
 */
export const VISIT_DEDUPE_SECONDS = 30 * 60

/** KV key holding the cached aggregate. */
export const INSIGHTS_CACHE_KEY = 'insights:summary'

/**
 * TTL for the cached aggregate.
 *
 * Five minutes: long enough that a burst of traffic is served entirely from KV,
 * short enough that the panel still feels alive. The `computedAt` field is
 * returned so the UI can be honest about the age of what it is showing rather
 * than implying it is live.
 */
export const INSIGHTS_CACHE_TTL_SECONDS = 300

/**
 * Records a visit unless this session was already counted recently.
 *
 * Returns whether anything was written, which the caller logs and nothing else
 * depends on.
 *
 * Called from `ctx.waitUntil()`, so it runs after the response has been sent and
 * never adds latency to the request. That also means a failure here is invisible
 * to the visitor, which is the right trade for analytics — hence the try/catch
 * rather than letting it reject an already-delivered response.
 */
export async function logVisitOnce(
  db: D1Database,
  kv: KVNamespace,
  sessionId: string,
  geo: GeoSnapshot,
  now: number,
): Promise<boolean> {
  const marker = `visit:seen:${sessionId}`

  try {
    const seen = await kv.get(marker, 'text')
    if (seen !== null) return false

    // Marker first. If the D1 writes fail we lose one visit from the stats;
    // if it went last, a failure would let the next poll try again and the
    // retry storm would be worse than the missing row.
    await kv.put(marker, '1', { expirationTtl: VISIT_DEDUPE_SECONDS })

    await db
      .prepare(
        `INSERT INTO visit_events (session_id, country, city, colo, continent, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
      .bind(sessionId, geo.country, geo.city, geo.colo, geo.continent, now)
      .run()

    await touchSession(db, sessionId, geo, now)

    return true
  } catch (err) {
    console.error('Visit logging failed:', err)
    return false
  }
}

/**
 * Computes the aggregate panel data.
 *
 * All five statements go out in one `batch()`, which is one round trip instead of
 * five. They are ordered here the same way they are destructured below — keep
 * them in step when editing.
 *
 * The two GROUP BY queries are the reason this result is cached: they scan the
 * whole visit log by definition, and no index changes that. The three COUNTs are
 * cheap and just come along for the ride.
 */
export async function readInsights(
  db: D1Database,
  now: number,
): Promise<Omit<InsightsData, 'cached'>> {
  const dayAgo = now - 24 * 60 * 60 * 1000

  const [visits, sessions, recent, countries, colos] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT COUNT(*) AS total FROM visit_events`),
    db.prepare(`SELECT COUNT(*) AS total FROM visitor_sessions`),
    db.prepare(`SELECT COUNT(*) AS total FROM visit_events WHERE created_at > ?1`).bind(dayAgo),
    db.prepare(
      `SELECT country AS key, COUNT(*) AS count
         FROM visit_events
        WHERE country IS NOT NULL AND country <> 'unknown'
        GROUP BY country
        ORDER BY count DESC, country ASC
        LIMIT 6`,
    ),
    db.prepare(
      `SELECT colo AS key, COUNT(*) AS count
         FROM visit_events
        WHERE colo IS NOT NULL AND colo <> 'unknown'
        GROUP BY colo
        ORDER BY count DESC, colo ASC
        LIMIT 6`,
    ),
  ])

  return {
    totalVisits: readScalar(visits, 'total'),
    uniqueVisitors: readScalar(sessions, 'total'),
    visitsLast24h: readScalar(recent, 'total'),
    topCountries: readBuckets(countries),
    topColos: readBuckets(colos),
    computedAt: new Date(now).toISOString(),
  }
}
