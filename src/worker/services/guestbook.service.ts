import type { GuestbookEntry, GuestbookInput, GuestbookStats } from '../types/data'
import { readBuckets, readScalar } from '../utils/d1'
import type { GeoSnapshot } from './edge.service'

/**
 * Guestbook persistence and validation.
 *
 * Every constraint enforced here is also a CHECK constraint in
 * migrations/0001_init.sql. Duplication on purpose: the service returns a useful
 * error message, the database guarantees the invariant even if a future caller
 * forgets to validate.
 */

/**
 * Avatar ids a visitor may claim.
 *
 * Duplicated from `src/components/chat/avengerAvatars.ts`, which stays the source
 * of truth for names and colours. The worker cannot import it — `src/worker` is a
 * separate TypeScript project (see src/worker/tsconfig.json) and reaching into
 * the client tree would break that boundary and drag Vue types into the worker
 * build. Keep this list in sync when adding a hero; the allowlist is what stops
 * an arbitrary string reaching the DOM as a component prop.
 */
export const ALLOWED_AVATAR_IDS = [
  'ironman',
  'cap',
  'thor',
  'hulk',
  'spiderman',
  'blackwidow',
  'blackpanther',
  'drstrange',
  'groot',
] as const

export const MAX_NAME_LENGTH = 32
export const MAX_MESSAGE_LENGTH = 280
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50

/** Row shape as stored. Mapped to `GuestbookEntry` before leaving the worker. */
interface GuestbookRow {
  id: string
  display_name: string
  message: string
  avatar_id: string
  country: string | null
  city: string | null
  colo: string | null
  created_at: number
}

/**
 * Code point ranges stripped from every user-supplied field, as [start, end]
 * pairs.
 *
 * Written as numbers rather than a regex character class so the file stays pure
 * ASCII — a class full of escaped control characters is unreadable in review and
 * easy to corrupt in an edit.
 *
 * What is here and why:
 *   - C0 controls except tab (0x09) and newline (0x0A), which are legitimate.
 *   - DEL and the C1 block.
 *   - Zero-width space through right-to-left mark: invisible padding, used to
 *     fake distinct names or slip past a duplicate check.
 *   - The bidirectional override and isolate sets. These matter most: left in,
 *     a visitor can reverse how the text around their entry renders and spoof
 *     the surrounding display. No legitimate message needs them.
 *   - BOM, which is invisible and breaks naive string comparison.
 */
const FORBIDDEN_RANGES: readonly [number, number][] = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
]

function isForbidden(codePoint: number): boolean {
  return FORBIDDEN_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end)
}

/**
 * Normalises a user string: strip hostile code points, collapse horizontal
 * whitespace and blank-line runs, trim, then cap the length.
 *
 * The cap counts code points (iterating the string yields code points, not
 * UTF-16 units). An emoji costs two units but one code point, and SQLite's
 * `length()` counts characters — so measuring this way keeps this cap and the
 * CHECK constraint in agreement, instead of letting an emoji-heavy message pass
 * one and fail the other.
 */
function sanitize(raw: string, maxLength: number): string {
  const stripped = [...raw]
    .filter((char) => !isForbidden(char.codePointAt(0) ?? 0))
    .join('')

  const cleaned = stripped
    // Collapse runs of spaces and tabs but leave newlines alone, so a visitor
    // can still write two short lines without them becoming one.
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const points = [...cleaned]
  return points.length > maxLength ? points.slice(0, maxLength).join('') : cleaned
}

export type ValidationResult =
  | { ok: true; value: GuestbookInput }
  | { ok: false; message: string }

/**
 * Validates and normalises a submitted entry.
 *
 * Over-long text is truncated rather than rejected — someone who pasted a
 * paragraph gets their first 280 characters posted instead of an error — but a
 * field that is empty *after* sanitising is a real error, because there is
 * nothing left to show.
 */
export function validateInput(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, message: 'Expected a JSON object with name, message and avatarId.' }
  }

  const body = raw as Record<string, unknown>

  if (typeof body.name !== 'string' || typeof body.message !== 'string') {
    return { ok: false, message: '`name` and `message` are required strings.' }
  }

  const name = sanitize(body.name, MAX_NAME_LENGTH)
  if (!name) {
    return { ok: false, message: 'Nama tidak boleh kosong.' }
  }

  const message = sanitize(body.message, MAX_MESSAGE_LENGTH)
  if (!message) {
    return { ok: false, message: 'Pesan tidak boleh kosong.' }
  }

  const avatarId = typeof body.avatarId === 'string' ? body.avatarId : ''
  if (!(ALLOWED_AVATAR_IDS as readonly string[]).includes(avatarId)) {
    return { ok: false, message: 'Avatar tidak dikenal.' }
  }

  return { ok: true, value: { name, message, avatarId } }
}

function toEntry(row: GuestbookRow): GuestbookEntry {
  return {
    id: row.id,
    name: row.display_name,
    message: row.message,
    avatarId: row.avatar_id,
    country: row.country ?? 'unknown',
    city: row.city ?? 'unknown',
    colo: row.colo ?? 'unknown',
    createdAt: new Date(row.created_at).toISOString(),
  }
}

/**
 * Inserts an entry and returns it as the browser will see it.
 *
 * The row is built here rather than read back with `RETURNING`, which saves a
 * round trip and lets the caller hand the entry straight to the client — the
 * client then prepends it locally instead of refetching a KV-cached list that
 * may not show the new row yet.
 */
export async function createEntry(
  db: D1Database,
  input: GuestbookInput,
  geo: GeoSnapshot,
  sessionId: string,
  now: number,
): Promise<GuestbookEntry> {
  const row: GuestbookRow = {
    id: crypto.randomUUID(),
    display_name: input.name,
    message: input.message,
    avatar_id: input.avatarId,
    country: geo.country,
    city: geo.city,
    colo: geo.colo,
    created_at: now,
  }

  await db
    .prepare(
      `INSERT INTO guestbook_entries
         (id, display_name, message, avatar_id, country, city, colo, status, session_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'visible', ?8, ?9)`,
    )
    .bind(
      row.id,
      row.display_name,
      row.message,
      row.avatar_id,
      row.country,
      row.city,
      row.colo,
      sessionId,
      row.created_at,
    )
    .run()

  return toEntry(row)
}

/**
 * Encodes a keyset cursor.
 *
 * `(created_at, id)` rather than an offset: entries arrive at the head of this
 * list, and an offset would make page 2 re-show a row page 1 already displayed
 * every time someone posted mid-scroll. Base64 to signal "opaque, do not
 * construct" — it is API hygiene, not a security boundary.
 */
function encodeCursor(createdAt: number, id: string): string {
  return btoa(`${createdAt}:${id}`)
}

function decodeCursor(cursor: string): { createdAt: number; id: string } | null {
  try {
    const decoded = atob(cursor)
    const separator = decoded.indexOf(':')
    if (separator === -1) return null

    const createdAt = Number.parseInt(decoded.slice(0, separator), 10)
    const id = decoded.slice(separator + 1)

    if (!Number.isFinite(createdAt) || !id) return null
    return { createdAt, id }
  } catch {
    // Malformed base64 from a hand-edited URL. Treated as "start from the top".
    return null
  }
}

export interface ListOptions {
  limit: number
  cursor: string | null
}

export interface EntryList {
  entries: GuestbookEntry[]
  nextCursor: string | null
}

/**
 * Fetches one page of visible entries, newest first.
 *
 * Asks for `limit + 1` rows to learn whether another page exists without a
 * second COUNT query, then trims the extra before returning.
 */
export async function listEntries(db: D1Database, options: ListOptions): Promise<EntryList> {
  const limit = Math.min(Math.max(1, Math.floor(options.limit)), MAX_PAGE_SIZE)
  const probe = limit + 1
  const cursor = options.cursor ? decodeCursor(options.cursor) : null

  // The compound comparison is what makes the keyset stable when several entries
  // share a millisecond: fall back to the id to break the tie in the same
  // direction as the ORDER BY.
  const statement = cursor
    ? db
        .prepare(
          `SELECT id, display_name, message, avatar_id, country, city, colo, created_at
             FROM guestbook_entries
            WHERE status = 'visible'
              AND (created_at < ?1 OR (created_at = ?1 AND id < ?2))
            ORDER BY created_at DESC, id DESC
            LIMIT ?3`,
        )
        .bind(cursor.createdAt, cursor.id, probe)
    : db
        .prepare(
          `SELECT id, display_name, message, avatar_id, country, city, colo, created_at
             FROM guestbook_entries
            WHERE status = 'visible'
            ORDER BY created_at DESC, id DESC
            LIMIT ?1`,
        )
        .bind(probe)

  const result = await statement.all<GuestbookRow>()
  const rows = result.results ?? []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]

  return {
    entries: page.map(toEntry),
    nextCursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null,
  }
}

/**
 * Total visible entries plus the countries they came from.
 *
 * Two statements in one `batch()` call, which costs a single round trip. Neither
 * is expensive at portfolio scale — the COUNT is served by the index — so the KV
 * cache in front of this exists to keep repeat page loads off D1 entirely rather
 * than to rescue a slow query.
 */
export async function readStats(db: D1Database): Promise<Omit<GuestbookStats, 'cached'>> {
  const [totalResult, countryResult] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT COUNT(*) AS total FROM guestbook_entries WHERE status = 'visible'`),
    db.prepare(
      `SELECT country AS key, COUNT(*) AS count
         FROM guestbook_entries
        WHERE status = 'visible' AND country IS NOT NULL AND country <> 'unknown'
        GROUP BY country
        ORDER BY count DESC, country ASC
        LIMIT 5`,
    ),
  ])

  return {
    total: readScalar(totalResult, 'total'),
    topCountries: readBuckets(countryResult),
  }
}
