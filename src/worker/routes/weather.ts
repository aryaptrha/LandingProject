import { Hono } from 'hono'
import { fetchUpstream } from '../gateway/upstream'
import { checkRateLimit, ipBucket, rateLimitHeaders } from '../services/ratelimit.service'
import {
  buildWeatherUrl,
  coarsen,
  normalize,
  readGeoPoint,
  type OwmCurrentWeather,
} from '../services/weather.service'
import type { AppEnv } from '../types/env'
import type { WeatherData } from '../types/weather'
import { error, success } from '../utils/response'

/**
 * Weather where the visitor is, from OpenWeather via the gateway.
 *
 * The route is deliberately thin, in the same way `routes/insights.ts` is: geo
 * parsing and payload shaping live in `weather.service.ts`, and timeouts, retries,
 * caching and the breaker live in `gateway/upstream.ts`. What is left here is the
 * three decisions that are genuinely this endpoint's own — is the key configured,
 * is this caller asking too often, and what does a gateway failure look like to a
 * browser.
 */
const weather = new Hono<AppEnv>()

/**
 * Per-IP ceiling.
 *
 * Twenty requests per five minutes against a resource the client polls every ten
 * minutes: generous for a person, including one who reloads or opens the site in
 * several tabs, and still a bound on a script. The real quota protection is the
 * 10-minute KV cache — a rate limit only matters for a caller who would otherwise
 * force cache misses by walking coordinates.
 */
const WEATHER_RATE_LIMIT = 20
const WEATHER_WINDOW_SECONDS = 300

/**
 * Translates a gateway failure into an HTTP answer.
 *
 * None of the upstream's own statuses are forwarded. A 401 from OpenWeather means
 * *this worker's* key is wrong, which is an operator problem and not something to
 * tell a visitor to retry; a 404 from OpenWeather is not a 404 of `/api/weather`.
 * So everything collapses to 502 or 503 — this endpoint is fine, the thing behind
 * it is not — and the operator-facing detail goes to the log, which the gateway
 * middleware has already stamped with a request id.
 *
 * `UPSTREAM_UNAVAILABLE` is the open breaker, and it is the one case with a
 * `Retry-After`: the cooldown is a known duration, so the client can be told
 * exactly how long rather than guessing.
 */
function upstreamError(reason: string, requestScopedHint: string): Response {
  if (reason === 'UPSTREAM_UNAVAILABLE') {
    return error(
      'Layanan cuaca sedang bermasalah. Coba lagi beberapa menit lagi ya.',
      'UPSTREAM_UNAVAILABLE',
      503,
      { 'Retry-After': '120' },
    )
  }

  if (reason === 'TIMEOUT') {
    return error(
      'Layanan cuaca tidak merespons. Coba lagi sebentar lagi ya.',
      'UPSTREAM_TIMEOUT',
      504,
    )
  }

  // BLOCKED lands here too. It means the registry and `buildWeatherUrl` disagree
  // about the origin, which is a bug in this repo rather than an upstream outage —
  // but it is still not something a visitor can act on, so it reads the same.
  console.error(`Weather upstream failed (${reason}): ${requestScopedHint}`)
  return error(
    'Gagal mengambil data cuaca. Coba lagi sebentar lagi ya.',
    'UPSTREAM_ERROR',
    502,
  )
}

/** GET /api/weather — current conditions at the edge's view of the visitor. */
weather.get('/weather', async (c) => {
  const apiKey = c.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    // A distinct code, not a generic 500, because the frontend branches on it: the
    // panel hides itself rather than showing an error box. An unconfigured optional
    // feature is a deployment state, not a fault the visitor should be shown — the
    // same call `useInsights` already makes for `INSIGHTS_DISABLED`.
    return error(
      'Fitur cuaca belum dikonfigurasi di server ini.',
      'WEATHER_UNCONFIGURED',
      503,
    )
  }

  // KV is optional in `Env`, so both the cache and the limiter are conditional. The
  // route still works without it — just uncached and unlimited, which is the right
  // degradation for a fresh clone with no namespace bound yet.
  const kv = c.env.CACHE
  let limitHeaders: Record<string, string> = {}

  if (kv) {
    const bucket = await ipBucket(c.req.raw)
    const verdict = await checkRateLimit(kv, `weather:${bucket}`, {
      limit: WEATHER_RATE_LIMIT,
      windowSeconds: WEATHER_WINDOW_SECONDS,
    })
    limitHeaders = rateLimitHeaders(verdict)

    if (!verdict.allowed) {
      return error(
        `Terlalu banyak permintaan cuaca. Coba lagi dalam ${verdict.resetSeconds} detik ya.`,
        'RATE_LIMITED',
        429,
        { ...limitHeaders, 'Retry-After': String(verdict.resetSeconds) },
      )
    }
  }

  const geo = readGeoPoint(c.req.raw)
  const [lat, lon] = coarsen(geo.lat, geo.lon)

  // `executionCtx` throws rather than returning undefined when the worker was
  // invoked without one, so it is read behind a guard — the same shape
  // `routes/visitor.ts` uses. Without it the gateway awaits its own KV writes,
  // which is correct, just not free.
  let waitUntil: ((promise: Promise<unknown>) => void) | undefined
  try {
    const ctx = c.executionCtx
    waitUntil = (promise) => ctx.waitUntil(promise)
  } catch {
    waitUntil = undefined
  }

  const result = await fetchUpstream<OwmCurrentWeather>(
    'openweather',
    buildWeatherUrl(apiKey, lat, lon),
    {
      kv,
      waitUntil,
      // The coarsened point, and only the coarsened point. Never the URL — it
      // carries the API key, and a key-derived cache key would both persist a
      // secret and orphan every entry on rotation. See `UpstreamOptions.cacheParts`.
      cacheParts: ['weather', lat, lon],
    },
  )

  if (!result.ok) {
    return upstreamError(result.reason, `${result.message} after ${result.attempts} attempt(s)`)
  }

  const data = normalize(result.data, geo, result.cached)

  return success<WeatherData>(data, 200, {
    'X-Cache': result.cached ? 'HIT' : 'MISS',
    ...limitHeaders,
  })
})

export { weather }
