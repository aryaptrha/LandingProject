/**
 * Response shapes for the stateful endpoints backed by D1 and KV.
 *
 * Sibling of `cloudflare.ts`, which holds the shapes derived from `request.cf`.
 * The split is deliberate: everything in that file is computed per request and
 * costs nothing, everything here touches storage.
 *
 * Timestamps are ISO-8601 strings here even though D1 stores epoch milliseconds.
 * The conversion happens in the service layer so the wire format matches the
 * rest of /api/*, which already hands out `new Date().toISOString()`.
 */

/** A single guestbook entry as the browser sees it. */
export interface GuestbookEntry {
  id: string
  name: string
  message: string
  avatarId: string
  country: string
  city: string
  colo: string
  createdAt: string
}

/**
 * One page of entries, newest first.
 *
 * `nextCursor` is an opaque keyset cursor, null when the last page has been
 * reached. Opaque because it encodes (created_at, id) and callers must not build
 * one themselves — an offset would drift as new entries arrive at the head.
 */
export interface GuestbookPage {
  entries: GuestbookEntry[]
  nextCursor: string | null
  /** Whether this page was served from KV rather than D1. Surfaced in the UI. */
  cached: boolean
}

/** Aggregate counts over visible guestbook entries. */
export interface GuestbookStats {
  total: number
  topCountries: CountBucket[]
  cached: boolean
}

/** A `GROUP BY … ORDER BY count DESC` row. */
export interface CountBucket {
  key: string
  count: number
}

/** Aggregates over the visit log. */
export interface InsightsData {
  totalVisits: number
  uniqueVisitors: number
  visitsLast24h: number
  topCountries: CountBucket[]
  topColos: CountBucket[]
  /** When the aggregate was computed — may be up to the cache TTL old. */
  computedAt: string
  cached: boolean
}

/**
 * Runtime site configuration held in KV, editable without a deploy.
 *
 * Read on every request to the features it gates, so it is fetched with a
 * `cacheTtl` and falls back to `DEFAULT_SITE_CONFIG` when the key is absent —
 * a missing namespace must never take the site down.
 */
export interface SiteConfig {
  /** Master switch for guestbook writes. Reads stay available when false. */
  guestbookEnabled: boolean
  /** Optional banner shown above the guestbook, e.g. during moderation. */
  guestbookNotice: string | null
  /** Master switch for the insights panel. */
  insightsEnabled: boolean
}

/** What a client sends to create an entry. Validated before it reaches D1. */
export interface GuestbookInput {
  name: string
  message: string
  avatarId: string
}
