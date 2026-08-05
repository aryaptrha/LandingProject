import { Hono } from 'hono'
import { readSiteConfig } from '../services/config.service'
import {
  INSIGHTS_CACHE_KEY,
  INSIGHTS_CACHE_TTL_SECONDS,
  readInsights,
} from '../services/insights.service'
import { cacheKey, cached } from '../services/kv.service'
import type { InsightsData } from '../types/data'
import type { AppEnv } from '../types/env'
import { missingBindings, readStorage, storageUnavailableMessage } from '../utils/bindings'
import { error, success } from '../utils/response'

/**
 * Aggregates over the visit log.
 *
 * One route, and almost all of the work is deciding not to do it: the underlying
 * query group-bys the whole table, so it runs at most once every five minutes and
 * every other request is a KV read.
 */
const insights = new Hono<AppEnv>()

/** GET /api/insights — cached traffic summary. */
insights.get('/insights', async (c) => {
  const storage = readStorage(c.env)
  if (!storage) {
    return error(
      storageUnavailableMessage(missingBindings(c.env)),
      'STORAGE_UNAVAILABLE',
      503,
    )
  }

  const config = await readSiteConfig(storage.kv)
  if (!config.insightsEnabled) {
    return error('Panel statistik sedang dimatikan.', 'INSIGHTS_DISABLED', 403)
  }

  const outcome = await cached(
    storage.kv,
    cacheKey(INSIGHTS_CACHE_KEY),
    INSIGHTS_CACHE_TTL_SECONDS,
    () => readInsights(storage.db, Date.now()),
  )

  return success<InsightsData>({ ...outcome.value, cached: outcome.hit }, 200, {
    'X-Cache': outcome.hit ? 'HIT' : 'MISS',
  })
})

export { insights }
