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
      guestbookEnabled:
        typeof stored.guestbookEnabled === 'boolean'
          ? stored.guestbookEnabled
          : DEFAULT_SITE_CONFIG.guestbookEnabled,
      guestbookNotice:
        typeof stored.guestbookNotice === 'string' && stored.guestbookNotice.trim()
          ? stored.guestbookNotice.trim().slice(0, 200)
          : null,
      insightsEnabled:
        typeof stored.insightsEnabled === 'boolean'
          ? stored.insightsEnabled
          : DEFAULT_SITE_CONFIG.insightsEnabled,
    }
  } catch (err) {
    console.error('Site config read failed, using defaults:', err)
    return DEFAULT_SITE_CONFIG
  }
}
