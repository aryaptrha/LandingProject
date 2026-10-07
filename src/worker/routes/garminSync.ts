import { Hono, type Context } from 'hono'
import type { UpstreamFailure } from '../gateway/upstream'
import { checkRateLimit, ipBucket, rateLimitHeaders } from '../services/ratelimit.service'
import {
  dispatchSync,
  fetchLatestRun,
  fetchRun,
  MIN_OWNER_KEY_LENGTH,
  ownerKeyMatches,
  type GitHubContext,
  type SyncRun,
} from '../services/garminSync.service'
import type { AppEnv } from '../types/env'
import { error, success } from '../utils/response'

/**
 * Owner-only trigger for the Garmin sync.
 *
 * The site has no accounts, so "owner" means "holds `OWNER_KEY`". Everyone else
 * must be unable to start a sync: each run logs in to the owner's Garmin account,
 * and a stranger looping on this endpoint could get that account rate-limited or
 * flagged. Hence, in order: 404 when unconfigured (the route does not advertise
 * itself), a rate limit counted *before* the key is checked (so guessing costs the
 * guesser), and at most one run in flight plus a cooldown even for the owner.
 */
const garminSync = new Hono<AppEnv>()

/**
 * Ceiling on owner calls per IP.
 *
 * The client polls every 5s while a run is going, and a run takes about a
 * minute, so one sync spends roughly 15 calls. 30 per 10 minutes leaves room for
 * two back to back and is still nothing to brute-force a 32-character key with.
 */
const OWNER_RATE_LIMIT = 30
const OWNER_WINDOW_SECONDS = 600

/** Minimum gap between the end of a successful sync and the start of the next. */
const COOLDOWN_SECONDS = 120

/**
 * Slack when matching a run to the request that started it, for the old 204
 * dispatch with no run id: GitHub stamps `created_at` on its own clock, and a run
 * created a few seconds "before" the request is still the one it started.
 */
const CLOCK_SKEW_MS = 10_000

const PATH = '/owner/garmin-sync'

garminSync.use(PATH, async (c, next) => {
  const ownerKey = c.env.OWNER_KEY?.trim() ?? ''
  if (ownerKey.length < MIN_OWNER_KEY_LENGTH || !c.env.GITHUB_ACTIONS_TOKEN?.trim()) {
    // Identical to the router's catch-all, so an unconfigured deploy looks like
    // one without the route at all.
    return error('Not Found', 'NOT_FOUND', 404)
  }

  const kv = c.env.CACHE
  if (kv) {
    const bucket = await ipBucket(c.req.raw)
    const verdict = await checkRateLimit(kv, `owner:${bucket}`, {
      limit: OWNER_RATE_LIMIT,
      windowSeconds: OWNER_WINDOW_SECONDS,
    })
    if (!verdict.allowed) {
      return error(
        `Terlalu banyak permintaan. Coba lagi dalam ${verdict.resetSeconds} detik ya.`,
        'RATE_LIMITED',
        429,
        { ...rateLimitHeaders(verdict), 'Retry-After': String(verdict.resetSeconds) },
      )
    }
  }

  const header = c.req.header('Authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  if (!provided || !(await ownerKeyMatches(provided, ownerKey))) {
    return error('Kunci owner salah atau belum diset.', 'UNAUTHORIZED', 401)
  }

  await next()
})

function githubContext(c: Context<AppEnv>): GitHubContext {
  // `executionCtx` throws rather than returning undefined without one; same guard
  // as `routes/weather.ts`.
  let waitUntil: GitHubContext['waitUntil']
  try {
    const ctx = c.executionCtx
    waitUntil = (promise) => ctx.waitUntil(promise)
  } catch {
    waitUntil = undefined
  }
  return { token: c.env.GITHUB_ACTIONS_TOKEN!.trim(), kv: c.env.CACHE, waitUntil }
}

/**
 * Translates a gateway failure into an answer for the owner.
 *
 * More specific than `routes/weather.ts` on purpose: only the owner can reach
 * this, and "the token was rejected" is something they can fix, where a visitor
 * could not.
 */
function githubError(failure: { reason: UpstreamFailure; status: number; message: string }): Response {
  if (failure.reason === 'UPSTREAM_UNAVAILABLE') {
    return error('GitHub lagi nggak bisa dihubungi. Coba lagi semenit lagi ya.', 'UPSTREAM_UNAVAILABLE', 503, {
      'Retry-After': '60',
    })
  }
  if (failure.reason === 'TIMEOUT') {
    return error(
      'GitHub nggak merespons. Cek tab Actions, siapa tau sync-nya udah jalan.',
      'UPSTREAM_TIMEOUT',
      504,
    )
  }
  if (failure.status === 401 || failure.status === 403) {
    return error(
      'GitHub nolak token-nya. Cek GITHUB_ACTIONS_TOKEN: izin Actions read & write, dan belum expired.',
      'GITHUB_AUTH',
      502,
    )
  }
  if (failure.status === 404 || failure.status === 422) {
    // A fine-grained token without access to the repo also reads as 404.
    return error(
      'Workflow garmin-sync.yml nggak ketemu, atau token-nya nggak punya akses ke repo personal-chat.',
      'GITHUB_NOT_FOUND',
      502,
    )
  }
  console.error(`GitHub upstream failed (${failure.reason}): ${failure.message}`)
  return error('Gagal ngehubungin GitHub. Coba lagi sebentar lagi ya.', 'UPSTREAM_ERROR', 502)
}

/**
 * GET /api/owner/garmin-sync — state of one run.
 *
 * `?runId=` names it. `?since=<ISO>` means "the run started at or after this",
 * for a dispatch that came back without an id; `run` is null until GitHub lists
 * it. Neither: the latest run, which is also how the client checks a new key.
 */
garminSync.get(PATH, async (c) => {
  const ctx = githubContext(c)
  const runId = Number(c.req.query('runId'))

  if (Number.isSafeInteger(runId) && runId > 0) {
    const result = await fetchRun(ctx, runId)
    return result.ok ? success({ run: result.data }) : githubError(result)
  }

  const result = await fetchLatestRun(ctx)
  if (!result.ok) return githubError(result)

  const since = Date.parse(c.req.query('since') ?? '')
  const run = result.data
  if (run && !Number.isNaN(since) && Date.parse(run.startedAt) < since - CLOCK_SKEW_MS) {
    return success({ run: null })
  }
  return success({ run })
})

/**
 * POST /api/owner/garmin-sync — start a sync, unless one is already going.
 *
 * A queued or running run is returned as-is rather than joined by a second one:
 * the workflow's concurrency group would queue it anyway, and two runs refreshing
 * the same Garmin token is exactly what that group exists to prevent.
 */
garminSync.post(PATH, async (c) => {
  const ctx = githubContext(c)

  const latest = await fetchLatestRun(ctx)
  if (!latest.ok) return githubError(latest)

  const run = latest.data
  if (run && (run.state === 'queued' || run.state === 'running')) {
    return success({ run, alreadyRunning: true, requestedAt: null })
  }

  if (run?.state === 'success') {
    const elapsed = (Date.now() - Date.parse(run.updatedAt)) / 1000
    if (elapsed < COOLDOWN_SECONDS) {
      const wait = Math.ceil(COOLDOWN_SECONDS - elapsed)
      return error(`Baru aja sync. Coba lagi ${wait} detik lagi ya.`, 'COOLDOWN', 429, {
        'Retry-After': String(wait),
      })
    }
  }

  const requestedAt = new Date().toISOString()
  const dispatched = await dispatchSync(ctx)
  if (!dispatched.ok) return githubError(dispatched)

  const started = dispatched.data
  const newRun: SyncRun | null = started && {
    id: started.id,
    state: 'queued',
    startedAt: requestedAt,
    updatedAt: requestedAt,
    url: started.url,
  }
  return success({ run: newRun, alreadyRunning: false, requestedAt })
})

export { garminSync }
