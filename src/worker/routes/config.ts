import { Hono } from 'hono'
import { readSiteConfig } from '../services/config.service'
import type { SiteConfig } from '../types/data'
import type { AppEnv } from '../types/env'
import { success } from '../utils/response'

/**
 * Read-only view of the runtime config in KV.
 *
 * Its own endpoint rather than a field on the guestbook and insights payloads,
 * because both panels need it and duplicating it would mean two places to keep in
 * step. The front end fetches it once and shares it.
 *
 * There is deliberately no write route. The only way to change this is
 * `wrangler kv key put`, which means the ability to change it is the ability to
 * deploy — no admin endpoint to authenticate, no token to leak, nothing for a
 * scanner to find. See services/config.service.ts for the command.
 *
 * Every field is safe to hand to a browser; the document holds feature flags and a
 * notice string, never a secret.
 */
const config = new Hono<AppEnv>()

/** GET /api/config — feature flags for the client. */
config.get('/config', async (c) => {
  // No storage guard and no error path. Unlike the data routes this one has a
  // meaningful answer without KV — the defaults — and `readSiteConfig` already
  // falls back to them for a missing binding, a missing key, or a KV failure. So a
  // site with no bindings yet still renders its panels and lets each one fail with
  // its own clear message.
  return success<SiteConfig>(await readSiteConfig(c.env?.CACHE))
})

export { config }
