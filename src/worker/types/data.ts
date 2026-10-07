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
 * Per-lap readings from the watch. Every field is null when the watch did not
 * record it — running dynamics in particular usually need a chest strap or pod.
 */
export interface RunSplit {
  distanceKm: number
  /** `"M:SS"`, or `"H:MM:SS"` from an hour up. A string because the sync formats it. */
  duration: string
  /** `"M:SS/km"`, or null when the lap had no usable speed. */
  pace: string | null
  avgHr: number | null
  cadence: number | null
  strideLengthM: number | null
  verticalOscillationCm: number | null
  verticalRatio: number | null
  groundContactMs: number | null
  avgPower: number | null
  elevationGainM: number | null
}

/** Garmin's training effect, both scales 0.0–5.0. */
export interface RunTrainingEffect {
  aerobic: number | null
  anaerobic: number | null
  /** Garmin's own name for the session, e.g. "Tempo" or "Aerobic base". */
  label: string | null
}

/**
 * One run as `/api/runs` publishes it.
 *
 * A whitelist, not a pass-through: `runs.service.ts` copies these fields by name
 * out of the persona backend's snapshot. The snapshot is already curated for
 * publishing, but it is curated by another repo, so a field it grows later should
 * have to be added here on purpose before it reaches the page.
 */
export interface PublicRun {
  /** Local calendar date of the run, `YYYY-MM-DD`, in `RunsData.timezone`. No time. */
  date: string
  distanceKm: number
  duration: string
  pace: string | null
  avgHr: number | null
  maxHr: number | null
  cadence: number | null
  maxCadence: number | null
  elevationGainM: number | null
  strideLengthM: number | null
  verticalOscillationCm: number | null
  verticalRatio: number | null
  groundContactMs: number | null
  avgPower: number | null
  trainingEffect: RunTrainingEffect | null
  trainingLoad: number | null
  /** Time in heart-rate zones 1 to 5, as duration strings. */
  hrZones: string[] | null
  splits: RunSplit[] | null
}

/** The latest runs, newest first. */
export interface RunsData {
  /** At most three. Empty until the first sync has written a snapshot. */
  runs: PublicRun[]
  /** When the sync wrote the snapshot, null when it never has. */
  generatedAt: string | null
  /** IANA zone the run dates are local to, e.g. `Asia/Jakarta`. */
  timezone: string
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
  /**
   * Master switch for the shared pixel canvas.
   *
   * False hides the panel and refuses the WebSocket upgrade, which leaves the board
   * intact in the Durable Object's storage — this is a pause, not a wipe. The reason
   * it exists is the same reason `guestbookEnabled` does: a shared drawing surface is
   * a spam target, and the response to someone drawing something vile at 3am should
   * be one `wrangler kv key put` from a phone, not a rebuild and a deploy.
   */
  canvasEnabled: boolean
  /** Optional banner shown above the canvas, e.g. while it is paused. */
  canvasNotice: string | null
}

/** What a client sends to create an entry. Validated before it reaches D1. */
export interface GuestbookInput {
  name: string
  message: string
  avatarId: string
}
