import { UPSTREAMS } from '../gateway/registry'
import type { GeoSource, WeatherCondition, WeatherData } from '../types/weather'

/**
 * Turns an edge request plus an OpenWeather payload into a `WeatherData`.
 *
 * Split from `routes/weather.ts` for the same reason `edge.service.ts` is split
 * from `routes/edge.ts`: reading `request.cf` and shaping an upstream response are
 * both pure functions of their input, and neither needs a `Response` in scope to
 * be tested or reasoned about. The route is left with policy — key present, rate
 * limit, cache verdict — and nothing else.
 */

/** A point to ask about, plus how much to trust it. */
export interface GeoPoint {
  lat: number
  lon: number
  /** From `cf.city`, when the edge knew it. */
  city: string | null
  countryCode: string
  colo: string
  source: GeoSource
}

/**
 * Where to ask about when the edge tells us nothing.
 *
 * Miniflare populates almost none of `cf`, so this is the coordinate every local
 * `wrangler dev` request resolves to — without it the whole feature would be
 * undevelopable outside a deployed worker. Jakarta, because the site's copy is
 * Indonesian and a plausible default beats a null island in the Atlantic.
 *
 * This substitutes a *location*, never a reading. The temperature that comes back
 * is the real temperature in Jakarta, and `geoSource: 'fallback'` travels with it
 * so the panel can say so.
 */
const FALLBACK_POINT = { lat: -6.21, lon: 106.85, label: 'Jakarta' } as const

/** Same defensive accessor `edge.service.ts` uses — `cf` is absent more often than not. */
function getCf(request: Request): IncomingRequestCfProperties | Record<string, never> {
  return (request as unknown as { cf?: IncomingRequestCfProperties }).cf ?? {}
}

function cfString(
  cf: IncomingRequestCfProperties | Record<string, never>,
  key: string,
): string | null {
  if (!(key in cf)) return null
  const value = (cf as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Parses a coordinate that arrived as a string.
 *
 * `cf.latitude` and `cf.longitude` are typed `string | undefined` in
 * `@cloudflare/workers-types` — they really are strings on the wire. The range
 * check is not defensive theatre: an out-of-range or NaN coordinate forwarded to
 * OpenWeather comes back as a 400, which the breaker would then count as an
 * upstream failure. Rejecting it here means falling back to a point that works.
 */
function parseCoord(raw: string | null, max: number): number | null {
  if (raw === null) return null
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || Math.abs(value) > max) return null
  return value
}

/**
 * Reads the point to ask about off the incoming request.
 *
 * Both coordinates must be present and valid or neither is used — a request with a
 * latitude and no longitude is not half-located, it is unlocated, and mixing an
 * edge latitude with a fallback longitude would put the reading in the sea.
 */
export function readGeoPoint(request: Request): GeoPoint {
  const cf = getCf(request)
  const colo = cfString(cf, 'colo') ?? 'unknown'
  const countryCode = cfString(cf, 'country') ?? 'unknown'
  const city = cfString(cf, 'city')

  const lat = parseCoord(cfString(cf, 'latitude'), 90)
  const lon = parseCoord(cfString(cf, 'longitude'), 180)

  if (lat === null || lon === null) {
    return {
      lat: FALLBACK_POINT.lat,
      lon: FALLBACK_POINT.lon,
      city,
      countryCode,
      colo,
      source: 'fallback',
    }
  }

  return { lat, lon, city, countryCode, colo, source: 'edge' }
}

/**
 * Rounds a point to 2 decimal places (~1.1 km) — the only precision that leaves
 * this function, for both the cache key and the upstream query.
 *
 * Three things at once, which is why it is worth its own function:
 *
 *   1. **Quota.** Everyone in the same square kilometre shares one cached entry.
 *      At 2 dp a city collapses into a few hundred distinct keys instead of one
 *      per visitor, which is the difference between a free API tier lasting and
 *      not.
 *   2. **Privacy.** Neither KV nor OpenWeather is told the coordinate the edge
 *      actually handed us. Nothing downstream needs a visitor located more
 *      precisely than the answer requires.
 *   3. **Hit rate.** Weather does not vary across 1 km, so nothing is lost.
 *
 * Returns strings because they go straight into both a cache key and a query
 * parameter, and `toFixed` is what guarantees `-6.2` and `-6.20` are the same key.
 */
export function coarsen(lat: number, lon: number): [string, string] {
  return [lat.toFixed(2), lon.toFixed(2)]
}


/**
 * Builds the upstream URL, at the coarsened point.
 *
 * The origin comes from the registry rather than being written out here, so the
 * allowlist in `upstream.ts` and the URL it checks can never drift apart.
 *
 * Coordinates arrive as the strings `coarsen()` produced, which enforces the
 * invariant that matters: the point queried and the point used as a cache key are
 * the same point. Passing raw numbers here would let the two diverge, and a cache
 * entry that answers for a coordinate it was not fetched for is a subtle way to
 * report the wrong weather.
 *
 * `units=metric` is what makes `tempC` and `windSpeedMs` true to their names —
 * omit it and OpenWeather answers in Kelvin.
 *
 * This is the only place the API key is interpolated, and the result is treated as
 * a credential from here on: `fetchUpstream` logs origins rather than URLs, and it
 * refuses to build a cache key out of one.
 */
export function buildWeatherUrl(apiKey: string, lat: string, lon: string): string {
  const url = new URL('/data/2.5/weather', UPSTREAMS.openweather.origin)
  url.searchParams.set('lat', lat)
  url.searchParams.set('lon', lon)
  url.searchParams.set('units', 'metric')
  url.searchParams.set('appid', apiKey)
  return url.toString()
}

/**
 * The slice of OpenWeather's `/data/2.5/weather` response this code reads.
 *
 * Every field is optional, including ones the API documents as always present.
 * That is not paranoia about OpenWeather specifically — it is that `fetchUpstream`
 * asserts its type parameter rather than validating it, so this interface is a
 * claim about a JSON blob, not a guarantee. Typing a field as required would let
 * `normalize()` read `undefined` through a non-optional type and produce `NaN` in
 * the response body, which is worse than an obvious fallback.
 */
export interface OwmCurrentWeather {
  weather?: Array<{ id?: number }>
  main?: { temp?: number; feels_like?: number; humidity?: number }
  wind?: { speed?: number }
  sys?: { sunrise?: number; sunset?: number; country?: string }
  dt?: number
  name?: string
}

/**
 * Maps an OpenWeather condition id onto the closed union.
 *
 * OpenWeather groups its ~50 ids by leading digit, which is the whole reason this
 * is a range check rather than a 50-entry lookup table: the group is the stable
 * part of that API, and new ids get added inside existing groups.
 *
 * The 7xx group (mist, smoke, haze, dust, fog, sand, ash, squall, tornado)
 * collapses to `mist`. Losing the distinction between fog and a tornado is a real
 * loss of fidelity, and it is accepted deliberately: the scene draws haze bands,
 * and a tornado sprite that only ever appears for a handful of visitors a year is
 * not worth hand-authoring on a 64px grid. The numbers next to the sky stay exact.
 *
 * An unrecognised id falls back to `clouds` rather than throwing. A sky that reads
 * slightly wrong is a better failure than a panel that vanishes because OpenWeather
 * shipped an id this code has not seen.
 */
export function mapCondition(id: number | undefined): WeatherCondition {
  if (id === undefined || !Number.isFinite(id)) return 'clouds'
  if (id >= 200 && id < 300) return 'thunder'
  if (id >= 300 && id < 400) return 'drizzle'
  if (id >= 500 && id < 600) return 'rain'
  if (id >= 600 && id < 700) return 'snow'
  if (id >= 700 && id < 800) return 'mist'
  if (id === 800) return 'clear'
  if (id > 800 && id < 900) return 'clouds'
  return 'clouds'
}

/**
 * Whether the observation is after dark *at the observed location*.
 *
 * Compares the upstream's own `dt` against its own `sunrise` / `sunset`, all three
 * of which are UTC unix seconds for that coordinate. Deliberately not
 * `new Date().getHours()`: the worker runs in whichever colo took the request, so
 * a server-clock check would put a Singapore visitor under a European sky.
 *
 * `sunrise` and `sunset` describe the current day at that place, so within a few
 * minutes either side of local midnight the comparison can be off. A star that
 * lingers past dawn for one cache cycle is an acceptable error; the alternative is
 * a solar-position calculation for a decorative sprite.
 *
 * With either bound missing this returns false — daytime — because the day scene is
 * the one that reads correctly with no stars in it.
 */
function isAfterDark(payload: OwmCurrentWeather): boolean {
  const dt = payload.dt
  const sunrise = payload.sys?.sunrise
  const sunset = payload.sys?.sunset
  if (dt === undefined || sunrise === undefined || sunset === undefined) return false
  return dt < sunrise || dt >= sunset
}

/** Finite number or the fallback — never `NaN`, which would serialise as `null`. */
function num(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Shapes an upstream payload into the response body.
 *
 * Field-by-field on purpose. A spread would ship OpenWeather's whole payload —
 * its internal ids, its station metadata, the precise coordinate it echoes back —
 * to every visitor, and would make the browser's contract with this API whatever
 * OpenWeather happened to return that day.
 *
 * Temperatures are rounded to whole degrees here rather than in the component.
 * `useCountUp` rounds every frame it renders anyway, so a decimal would survive
 * only until it reached the DOM, and a cached `27.34` implies a precision that a
 * reading shared across a square kilometre does not have.
 */
export function normalize(
  payload: OwmCurrentWeather,
  geo: GeoPoint,
  cached: boolean,
): WeatherData {
  // `noUncheckedIndexedAccess` makes this `| undefined`, which is exactly right:
  // an empty `weather` array is a shape this code has to survive, and `mapCondition`
  // already has an answer for a missing id.
  const primary = payload.weather?.[0]

  const observedSeconds = payload.dt
  const observedAt =
    observedSeconds !== undefined && Number.isFinite(observedSeconds)
      ? new Date(observedSeconds * 1000).toISOString()
      : new Date().toISOString()

  return {
    condition: mapCondition(primary?.id),
    isNight: isAfterDark(payload),
    tempC: Math.round(num(payload.main?.temp, 0)),
    feelsLikeC: Math.round(num(payload.main?.feels_like, 0)),
    // Clamped rather than merely defaulted: humidity is rendered as a percentage
    // bar, and a value outside 0-100 would scale the bar past its track.
    humidity: Math.min(100, Math.max(0, Math.round(num(payload.main?.humidity, 0)))),
    windSpeedMs: Math.round(num(payload.wind?.speed, 0) * 10) / 10,
    // Upstream name first: it is the place the reading is actually *for*. `cf.city`
    // is the runner-up because it describes the visitor rather than the observation
    // station, and the two can differ by a suburb.
    place: payload.name || geo.city || 'Lokasi tidak diketahui',
    countryCode: payload.sys?.country || geo.countryCode,
    colo: geo.colo,
    geoSource: geo.source,
    observedAt,
    cached,
  }
}
