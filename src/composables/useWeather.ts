import { ref, onMounted, onUnmounted, getCurrentInstance, type Ref } from 'vue'
import { ApiError, apiGet } from '@/utils/api'

/** Condition buckets the server maps OpenWeather's numeric ids down to. */
export type WeatherCondition =
  | 'clear'
  | 'clouds'
  | 'rain'
  | 'drizzle'
  | 'thunder'
  | 'snow'
  | 'mist'

/** Whether the coordinates came from the Cloudflare edge or the Jakarta fallback. */
export type GeoSource = 'edge' | 'fallback'

/**
 * Mirror of `WeatherData` in `src/worker/types/weather.ts`.
 *
 * Restated rather than imported because `tsconfig.app.json` excludes
 * `src/worker/**` — the two layers are separate TS projects on purpose, and every
 * other composable declares its response shape the same way. The tradeoff is that
 * a field renamed on the server does not break the build here; it shows up as
 * `undefined` at runtime instead. Kept field-for-field identical to limit that.
 */
export interface WeatherData {
  condition: WeatherCondition
  isNight: boolean
  tempC: number
  feelsLikeC: number
  /** Percent, 0-100. */
  humidity: number
  /** Metres per second. */
  windSpeedMs: number
  place: string
  countryCode: string
  colo: string
  geoSource: GeoSource
  /** ISO timestamp of the upstream observation, not of our fetch. */
  observedAt: string
  cached: boolean
}

/**
 * 10 minutes, matched to the gateway's KV TTL for this upstream
 * (`cacheTtlSeconds: 600` in `gateway/registry.ts`).
 *
 * Polling faster would spend requests on an answer KV is already holding: every
 * tick inside the TTL returns the same payload with `cached: true`. Polling slower
 * would leave a visibly stale temperature on screen with no way to tell. Change
 * one and change the other.
 */
const POLL_INTERVAL_MS = 600_000

/**
 * Client-side ceiling, deliberately wider than the other composables' 5s.
 *
 * The server side of this call can legitimately take a while: the gateway allows
 * 4s per attempt and one retry, plus backoff, so a slow-but-recovering OpenWeather
 * can push a legitimate response past 8s. A 5s client timeout would abort those
 * requests just before they succeeded — and worse, after the worker had already
 * spent the upstream quota. 12s clears the worst legitimate case with headroom.
 */
const REQUEST_TIMEOUT_MS = 12_000

// --- Shared singleton state -------------------------------------------------
// Module-level refs, so every caller shares one poll. Only `EdgeWeather.vue`
// mounts this today, but the composable polls, and in this codebase polling
// composables are shared singletons (`useEdgeStatus`, `useLatency`,
// `useSiteConfig`) while one-shot ones are per-component (`useInsights`). A
// second mount of a per-component poller silently doubles the upstream spend,
// which matters more here than elsewhere: this upstream is metered.
const data = ref<WeatherData | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

/**
 * Set only when the server has no OpenWeather key configured, so the panel can
 * hide itself instead of showing an error the visitor cannot act on. Same
 * treatment `useInsights` gives `INSIGHTS_DISABLED`: a deployment state, not a
 * failure.
 *
 * Transient upstream trouble is deliberately *not* routed here. A breaker that is
 * open for two minutes will close again, and hiding a whole section for those two
 * minutes would reflow the page under someone who is reading it — so those codes
 * fall through to `error` and render a retry.
 */
const isUnavailable = ref(false)

// --- Poll lifecycle ---------------------------------------------------------
let intervalId: ReturnType<typeof setInterval> | null = null
let currentController: AbortController | null = null
let isFetching = false

/**
 * Live subscriber count. The interval and the `visibilitychange` listener exist
 * only while this is above zero; the 0→1 and 1→0 transitions own all setup and
 * teardown so neither leaks.
 */
let subscribers = 0

async function fetchWeather(): Promise<void> {
  // A manual refresh landing on top of an interval tick must not open a second
  // request — this one costs upstream quota, not just a socket.
  if (isFetching) return

  if (currentController) {
    currentController.abort()
  }

  isFetching = true
  isLoading.value = true
  error.value = null
  currentController = new AbortController()

  const timeoutId = setTimeout(() => {
    currentController?.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    data.value = await apiGet<WeatherData>('/api/weather', {
      signal: currentController.signal,
    })
    isUnavailable.value = false
  } catch (e) {
    if (e instanceof ApiError && e.code === 'WEATHER_UNCONFIGURED') {
      // No key on the server. Hide, do not explain — see the note on the ref.
      isUnavailable.value = true
      error.value = null
      data.value = null
    } else if (e instanceof ApiError) {
      // Every other code the route can return already carries an Indonesian
      // message written for a reader (`RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`,
      // `UPSTREAM_TIMEOUT`, `UPSTREAM_ERROR`), so it is shown as-is rather than
      // flattened into one generic string.
      error.value = e.message
      // The last good reading is kept on screen. It is stamped with `observedAt`,
      // so an old temperature is labelled rather than passed off as current, and
      // a blanked-out panel during a 30s upstream blip is worse than a stale one.
    } else {
      error.value = e instanceof Error ? e.message : 'Gagal memuat data cuaca'
    }
  } finally {
    clearTimeout(timeoutId)
    currentController = null
    isFetching = false
    isLoading.value = false
  }
}

function startInterval() {
  stopInterval()
  intervalId = setInterval(fetchWeather, POLL_INTERVAL_MS)
}

function stopInterval() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function handleVisibilityChange() {
  // Hidden tab: stop polling. Visible again: one immediate fetch, because a tab
  // left open overnight would otherwise show yesterday's sky until the next tick,
  // then resume the cadence.
  if (document.hidden) {
    stopInterval()
  } else {
    fetchWeather()
    startInterval()
  }
}

function subscribe() {
  subscribers += 1
  if (subscribers > 1) return

  document.addEventListener('visibilitychange', handleVisibilityChange)

  // No deferral to `window.onload` here, unlike `useEdgeStatus`. This composable
  // is mounted from inside a `LazySection`, so it does not exist until the
  // visitor has scrolled near the panel — page load is long over by then, and
  // waiting again would just leave a skeleton on screen.
  if (!document.hidden) {
    fetchWeather()
    startInterval()
  }
}

function unsubscribe() {
  subscribers -= 1
  if (subscribers > 0) return

  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopInterval()
  if (currentController) {
    currentController.abort()
    currentController = null
  }
}

/**
 * Weather for the visitor's own edge location, polled on a shared 10-minute loop.
 *
 * The location comes from `request.cf` at the edge, so there is no browser
 * geolocation prompt and no coordinate ever leaves the worker at full precision —
 * it is rounded to two decimals server-side before the upstream call. Outside a
 * real Cloudflare edge (`wrangler dev`) `cf` carries no coordinates, so the server
 * falls back to Jakarta and says so in `geoSource`, which the panel surfaces. The
 * *location* falls back; the weather never does.
 */
export function useWeather(): {
  data: Ref<WeatherData | null>
  isLoading: Ref<boolean>
  isUnavailable: Ref<boolean>
  error: Ref<string | null>
  refresh: () => Promise<void>
} {
  // Outside a component setup there is no unmount to refcount against, so
  // subscribe once and let the shared poll live for the page. Matches the guard
  // in `useEdgeStatus` and `useLatency`.
  if (getCurrentInstance()) {
    onMounted(subscribe)
    onUnmounted(unsubscribe)
  } else {
    subscribe()
  }

  return {
    data,
    isLoading,
    isUnavailable,
    error,
    refresh: fetchWeather,
  }
}
