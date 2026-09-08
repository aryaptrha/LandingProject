/**
 * Shapes derived from an upstream API.
 *
 * A third category alongside `cloudflare.ts` (derived from `request.cf`) and
 * `data.ts` (derived from D1). The distinction matters because these are the only
 * types here whose source this project does not control: OpenWeather can add
 * fields, rename them, or return a shape it has never returned before, and none of
 * that may reach the browser. `weather.service.ts` therefore picks every field
 * below explicitly, and the raw upstream payload is never spread or passed through.
 */

/**
 * Weather reduced to the seven states the pixel scene can actually draw.
 *
 * OpenWeather ships ~50 condition ids across nine groups. Mapping them onto a
 * closed union is not laziness about detail — the union *is* the contract with
 * `WeatherSky.vue`, which has a hand-authored sprite layer per member. A string
 * passthrough would let an unhandled condition render an empty sky, and a union
 * makes that a type error instead.
 *
 * `drizzle` is kept separate from `rain` because the sprite differs (sparser, and
 * it falls one pixel at a time), which is the whole reason a visitor would notice.
 */
export type WeatherCondition =
  | 'clear'
  | 'clouds'
  | 'rain'
  | 'drizzle'
  | 'thunder'
  | 'snow'
  | 'mist'

/** Where the coordinates behind a reading came from. */
export type GeoSource =
  /** `request.cf` carried usable latitude/longitude — a real visitor at a real edge. */
  | 'edge'
  /**
   * `cf` had no coordinates, so a documented default was used. Surfaced to the UI
   * so the panel can say the *location* is approximate.
   *
   * There is no equivalent fallback for the reading itself: an invented
   * temperature would be misinformation, which is the same line `useCountUp`
   * refuses to cross when it snaps rather than animating from a placeholder.
   */
  | 'fallback'

/** One weather reading, as served by `GET /api/weather`. */
export interface WeatherData {
  condition: WeatherCondition
  /**
   * Chooses moon + stars over sun in the scene. Computed from the upstream's own
   * `sys.sunrise` / `sys.sunset` against `dt`, not from the server clock — the
   * visitor may be many timezones from the colo, and the sky should match where
   * they are rather than where the worker ran.
   */
  isNight: boolean
  tempC: number
  feelsLikeC: number
  /** Percent, 0-100. */
  humidity: number
  /** Metres per second, as the upstream reports under `units=metric`. */
  windSpeedMs: number
  /** Upstream place name, falling back to `cf.city`, then to the coarse label. */
  place: string
  countryCode: string
  /** The colo that served the request, so the panel can tie sky to edge location. */
  colo: string
  geoSource: GeoSource
  /** ISO timestamp of the observation, from the upstream's `dt`. */
  observedAt: string
  /** True when KV answered and no call to OpenWeather was made. */
  cached: boolean
}
