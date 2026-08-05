import type { GeoSnapshot } from './edge.service'

/**
 * Visitor session identity.
 *
 * ## Why the id is opaque and unsigned
 *
 * The first draft of this signed the cookie with an HMAC. That was dropped, and
 * the reasoning is worth keeping: a signature proves the server issued a value,
 * which only matters when the value grants something. This one does not. It
 * groups a person's visits and lets them see their own guestbook entries as
 * theirs — nothing is authorised by holding it, and forging one buys an attacker
 * a fresh empty bucket they could have got by clearing their cookies.
 *
 * So the id is 122 bits of `crypto.randomUUID()` randomness and no more. That
 * removes a secret from the deployment (one fewer thing to set, rotate, and
 * break the site by forgetting), and rotating a signing key would have silently
 * invalidated every existing session anyway.
 *
 * Consequence to keep in mind: session counts are a lower bound on people, not a
 * precise headcount. Cookie clearers and private windows each look new. For a
 * portfolio's "unique visitors" line that is honest enough, and the alternative
 * is fingerprinting, which is not on the table.
 */

/** Cookie name. Short prefix so it is recognisable in devtools. */
export const SESSION_COOKIE = 'ap_sid'

/** One year. Long enough that a returning visitor is still recognised. */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/** Mints a new session id. */
export function createSessionId(): string {
  return crypto.randomUUID()
}

/**
 * Reads the session id out of the Cookie header.
 *
 * Parsed by hand rather than with a cookie library: this needs exactly one
 * value, and the shape is validated on the way out anyway.
 *
 * Anything that is not a plausible UUID is rejected rather than trusted, so a
 * hand-edited cookie cannot smuggle arbitrary text into `session_id` in D1.
 */
export function readSessionId(request: Request): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null

  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue

    const name = part.slice(0, separator).trim()
    if (name !== SESSION_COOKIE) continue

    const value = part.slice(separator + 1).trim()
    return isPlausibleSessionId(value) ? value : null
  }

  return null
}

/** Accepts only the canonical lowercase UUID shape `crypto.randomUUID()` emits. */
function isPlausibleSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
}

/**
 * Builds the `Set-Cookie` value for a session id.
 *
 * - `HttpOnly` — no client script needs it, so no client script gets it.
 * - `Secure` — the site is HTTPS-only in production. Browsers make an exception
 *   for `http://localhost`, so `wrangler dev` still works.
 * - `SameSite=Lax` — the cookie should ride along on normal navigation but not
 *   on a cross-site POST, which is exactly the CSRF shape a guestbook invites.
 */
export function buildSessionCookie(id: string): string {
  return [
    `${SESSION_COOKIE}=${id}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ].join('; ')
}

/** A resolved session, plus whether the caller must send a `Set-Cookie` back. */
export interface ResolvedSession {
  id: string
  isNew: boolean
}

/** Returns the caller's session, minting one if they arrived without a valid id. */
export function resolveSession(request: Request): ResolvedSession {
  const existing = readSessionId(request)
  if (existing) return { id: existing, isNew: false }

  return { id: createSessionId(), isNew: true }
}

/**
 * Records that a session was seen, creating the row on first sight.
 *
 * `ON CONFLICT DO UPDATE` keeps this to one round trip. Geo is refreshed on
 * every touch rather than frozen at first sight, so a visitor who travels shows
 * up where they are now — the visit log keeps the history.
 */
export async function touchSession(
  db: D1Database,
  sessionId: string,
  geo: GeoSnapshot,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO visitor_sessions (id, first_seen, last_seen, visit_count, country, city, colo)
       VALUES (?1, ?2, ?2, 1, ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET
         last_seen   = excluded.last_seen,
         visit_count = visitor_sessions.visit_count + 1,
         country     = excluded.country,
         city        = excluded.city,
         colo        = excluded.colo`,
    )
    .bind(sessionId, now, geo.country, geo.city, geo.colo)
    .run()
}
