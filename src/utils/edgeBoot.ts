import type { EdgeStatusData } from '@/composables/useEdgeStatus'
import type { SiteConfigData } from '@/composables/useSiteConfig'

/**
 * Reader for the boot payload the worker streams into `<head>`.
 *
 * `src/worker/services/hydrate.service.ts` injects `window.__EDGE__` while the
 * document is still streaming, carrying the answers to `/api/edge-status`,
 * `/api/config` and `/api/visitor`. This file is the only thing that reads it.
 *
 * Pure, no Vue, matching `utils/latency.ts` — the composables own the reactivity,
 * this owns the parsing.
 *
 * **The absent case is the common case, not the edge case.** `npm run dev` serves
 * `index.html` straight from Vite with no worker in front of it, so
 * `window.__EDGE__` is missing throughout the primary development workflow. Only
 * `npm run cf` (which serves the built `dist/`) exercises injection at all. Every
 * consumer therefore has to work identically with and without a payload, and the
 * fallback path is the one that gets tested every day.
 *
 * The payload is validated field by field rather than trusted, for the same reason
 * `readSiteConfig` validates the KV document it just parsed: this is a wire format
 * crossing a process boundary, and `guestbookNotice` inside it is hand-authored.
 * Validation is all-or-nothing per section — a half-populated widget claiming to
 * report your edge location is misinformation, whereas a widget that fetches a
 * moment later is just slower. When a section fails to validate, its accessor
 * returns `null` and the consumer falls back to the request it would have made
 * anyway.
 */

/** The global the worker parks the payload on. Must match `BOOT_GLOBAL` in the worker. */
const GLOBAL_KEY = '__EDGE__'

/** Upper bound on a notice string, mirroring the worker-side clamp in `readSiteConfig`. */
const NOTICE_MAX_LENGTH = 200

/** The validated payload. Any section may be null; the whole thing may be null. */
interface EdgeBoot {
  edge: EdgeStatusData | null
  config: SiteConfigData | null
  visitLogged: boolean
}

/** What a missing or unusable payload looks like. Never mutated. */
const ABSENT: EdgeBoot = { edge: null, config: null, visitLogged: false }

/**
 * Memoised parse. `hasRead` is separate from `parsed` because "no payload" is a
 * legitimate, cacheable answer and must not be retried on every accessor call.
 */
let parsed: EdgeBoot = ABSENT
let hasRead = false

/** Narrows to a plain object without accepting arrays or null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validates the edge section.
 *
 * The `Record<keyof EdgeStatusData, ...>` annotation is doing real work: an object
 * literal assigned to it must supply *every* key, so if `EdgeStatusData` ever gains
 * a field this function fails to compile rather than quietly seeding `undefined`
 * into the widget. That is also what makes the cast on the way out safe.
 */
function parseEdge(raw: unknown): EdgeStatusData | null {
  if (!isRecord(raw)) return null

  const read = (key: keyof EdgeStatusData): string | null => {
    const value = raw[key]
    return typeof value === 'string' ? value : null
  }

  const edge: Record<keyof EdgeStatusData, string | null> = {
    status: read('status'),
    server: read('server'),
    colo: read('colo'),
    country: read('country'),
    countryCode: read('countryCode'),
    city: read('city'),
    continent: read('continent'),
    timezone: read('timezone'),
    protocol: read('protocol'),
    tlsVersion: read('tlsVersion'),
    ray: read('ray'),
    timestamp: read('timestamp'),
    cacheStatus: read('cacheStatus'),
  }

  for (const value of Object.values(edge)) {
    if (value === null) return null
  }

  return edge as EdgeStatusData
}

/**
 * Validates the config section.
 *
 * Strict rather than defaulting, deliberately. The worker's `readSiteConfig`
 * already applies per-field defaults before serialising, so anything malformed
 * arriving here means the payload itself is wrong — and the right recovery is the
 * real request, which has its own fail-open `DEFAULTS`. Defaulting twice would put
 * a second copy of those defaults in a second file, free to drift.
 */
function parseConfig(raw: unknown): SiteConfigData | null {
  if (!isRecord(raw)) return null

  const { guestbookEnabled, guestbookNotice, insightsEnabled, canvasEnabled, canvasNotice } = raw

  if (typeof guestbookEnabled !== 'boolean') return null
  if (typeof insightsEnabled !== 'boolean') return null
  if (typeof canvasEnabled !== 'boolean') return null
  if (guestbookNotice !== null && typeof guestbookNotice !== 'string') return null
  if (canvasNotice !== null && typeof canvasNotice !== 'string') return null

  return {
    guestbookEnabled,
    insightsEnabled,
    canvasEnabled,
    guestbookNotice: trimNotice(guestbookNotice),
    canvasNotice: trimNotice(canvasNotice),
  }
}

/** Trims and clamps a notice to the same bound the worker applies. */
function trimNotice(value: string | null): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed.slice(0, NOTICE_MAX_LENGTH) : null
}

/**
 * Reads, validates and memoises the payload, then removes the global.
 *
 * The global is deleted on first read so nothing can mistake it for live state:
 * it is a one-shot boot channel, and the values inside it start ageing the moment
 * the document is served. `useEdgeStatus` keeps its 30s poll precisely because the
 * seed is a snapshot, not a subscription.
 */
function readEdgeBoot(): EdgeBoot {
  if (hasRead) return parsed
  hasRead = true

  if (typeof window === 'undefined') return parsed

  try {
    const raw = window[GLOBAL_KEY]
    delete window[GLOBAL_KEY]

    if (!isRecord(raw)) return parsed

    parsed = {
      edge: parseEdge(raw.edge),
      config: parseConfig(raw.config),
      // Only an explicit `true` counts. Anything else and the client keeps
      // pinging `/api/visitor`, which is idempotent inside the worker's 30-minute
      // KV dedupe window — so the failure mode is a wasted request, not a
      // double-counted visit.
      visitLogged: raw.visitLogged === true,
    }
  } catch {
    // A frozen `window`, or a getter that throws. Nothing here is load-bearing
    // enough to justify letting it break the app before Vue has even mounted.
    parsed = ABSENT
  }

  return parsed
}

/**
 * Edge status as of the document request, or null to fetch it.
 *
 * A fresh copy each call, so a consumer assigning it into a `ref` and then
 * mutating that ref cannot reach back into the memo.
 */
export function bootEdgeStatus(): EdgeStatusData | null {
  const { edge } = readEdgeBoot()
  return edge ? { ...edge } : null
}

/** Site config as of the document request, or null to fetch it. Fresh copy per call. */
export function bootSiteConfig(): SiteConfigData | null {
  const { config } = readEdgeBoot()
  return config ? { ...config } : null
}

/** Whether the document request already scheduled this load's visit write. */
export function bootVisitLogged(): boolean {
  return readEdgeBoot().visitLogged
}
