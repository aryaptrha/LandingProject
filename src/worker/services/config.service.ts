import type { SiteConfig } from '../types/data'

/**
 * Runtime site configuration in KV.
 *
 * The point of this is the deploy you do not have to do. Spam arrives while you
 * are asleep, you flip one KV key from your phone, and guestbook writes stop —
 * no rebuild, no `wrangler deploy`, no waiting on a Vite build to finish. That is
 * the classic case for KV: a tiny value, read constantly, written almost never.
 *
 *   npx wrangler kv key put --binding=CACHE site:config \
 *     '{"guestbookEnabled":false,"guestbookNotice":"Sedang dibersihkan, balik lagi nanti ya!"}' --remote
 *
 * Absent key means defaults, which is why a fresh deploy works before anyone has
 * ever written this key.
 */

/** KV key holding the config document. */
export const SITE_CONFIG_KEY = 'site:config'

/**
 * Values used when the key is missing, malformed, or KV is unreachable.
 *
 * Everything defaults to enabled. A config store that fails closed would turn a
 * KV blip into an outage of features that work perfectly well without it.
 */
export const DEFAULT_SITE_CONFIG: SiteConfig = {
  guestbookEnabled: true,
  guestbookNotice: null,
  insightsEnabled: true,
  canvasEnabled: true,
  canvasNotice: null,
}

/** Upper bound on a notice, so a runaway CLI paste cannot become the whole page. */
const NOTICE_MAX_LENGTH = 200

/**
 * A boolean flag, or the default when the stored value is anything else.
 *
 * Extracted once there were four of these. The check is `typeof === 'boolean'` rather
 * than a truthiness test for a specific reason worth not rediscovering: this document
 * is hand-edited from a shell, and `"false"` — the string, easy to produce by
 * forgetting that JSON booleans are unquoted — is truthy.
 */
function readFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** A notice string, trimmed and clamped, or null when absent or blank. */
function readNotice(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, NOTICE_MAX_LENGTH) : null
}

/**
 * Reads the config, merging whatever is present over the defaults.
 *
 * `cacheTtl: 60` asks the edge to serve this from its local cache for a minute,
 * so a value read on every guestbook request costs at most one KV lookup per
 * minute per colo. The trade is that a change takes up to a minute to be visible
 * everywhere — acceptable for a kill switch, and stated here so nobody debugs
 * the delay twice.
 *
 * Each field is checked individually rather than trusting the parsed shape: this
 * document is hand-edited from a CLI, and one typo should not disable a feature
 * by turning `guestbookEnabled` into the string "false", which is truthy.
 */
export async function readSiteConfig(kv: KVNamespace | undefined): Promise<SiteConfig> {
  if (!kv) return DEFAULT_SITE_CONFIG

  try {
    const stored = await kv.get<Partial<SiteConfig>>(SITE_CONFIG_KEY, {
      type: 'json',
      cacheTtl: 60,
    })
    if (!stored || typeof stored !== 'object') return DEFAULT_SITE_CONFIG

    return {
      guestbookEnabled: readFlag(stored.guestbookEnabled, DEFAULT_SITE_CONFIG.guestbookEnabled),
      guestbookNotice: readNotice(stored.guestbookNotice),
      insightsEnabled: readFlag(stored.insightsEnabled, DEFAULT_SITE_CONFIG.insightsEnabled),
      canvasEnabled: readFlag(stored.canvasEnabled, DEFAULT_SITE_CONFIG.canvasEnabled),
      canvasNotice: readNotice(stored.canvasNotice),
    }
  } catch (err) {
    console.error('Site config read failed, using defaults:', err)
    return DEFAULT_SITE_CONFIG
  }
}
