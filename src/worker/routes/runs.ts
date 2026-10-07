import { Hono } from 'hono'
import { readRecentRuns, UnsupportedSnapshotError } from '../services/runs.service'
import type { RunsData } from '../types/data'
import type { AppEnv } from '../types/env'
import { error, success } from '../utils/response'

/**
 * The latest runs, for the "My Run" panel.
 *
 * One KV read against a namespace this worker does not own (see wrangler.toml), and
 * no cache-aside layer in `CACHE`: the snapshot is already a single precomputed
 * document, so caching it again would only add a second place for it to be stale.
 */
const runs = new Hono<AppEnv>()

/**
 * Browser cache for a successful answer. The snapshot changes every two hours at
 * most, so five minutes costs nothing in freshness and saves the repeat read when
 * a visitor navigates back to the page.
 */
const BROWSER_CACHE = 'public, max-age=300'

/** GET /api/runs — the three most recent runs from the Garmin snapshot. */
runs.get('/runs', async (c) => {
  const kv = c.env.RUNNING_STATS
  if (!kv) {
    return error(
      'Running stats are not configured for this worker. Missing binding: RUNNING_STATS (KV namespace).',
      'RUNS_UNAVAILABLE',
      503,
    )
  }

  try {
    const data = await readRecentRuns(kv)
    return success<RunsData>(data, 200, { 'Cache-Control': BROWSER_CACHE })
  } catch (err) {
    // A snapshot from a newer sync is a deploy that has not caught up, not a
    // transient fault — retrying will not help, so the panel hides instead of
    // offering a button that cannot work. Same code as the missing binding.
    if (err instanceof UnsupportedSnapshotError) {
      console.error(err.message)
      return error('Format data lari belum didukung.', 'RUNS_UNAVAILABLE', 503)
    }
    console.error('running-stats read failed:', err)
    return error('Data lari gagal dibaca. Coba lagi sebentar.', 'RUNS_READ_FAILED', 502)
  }
})

export { runs }
