import { ref, onMounted, onUnmounted, getCurrentInstance, type Ref } from 'vue'

export interface EdgeStatusData {
  status: string
  server: string
  colo: string
  country: string
  countryCode: string
  city: string
  continent: string
  timezone: string
  protocol: string
  tlsVersion: string
  ray: string
  timestamp: string
  cacheStatus: string
}

/**
 * How often the shared edge-status poll runs, in milliseconds. Owned by the
 * composable now rather than passed per-call: both callers already asked for
 * 30s, and a single shared loop has exactly one correct cadence.
 */
const POLL_INTERVAL_MS = 30000

/**
 * Hard ceiling on a single request. This composable previously had no
 * AbortController and no timeout at all, so a hung request had no ceiling and
 * overlapping polls were never cancelled; this matches the ceiling `useLatency`
 * already enforced.
 */
const REQUEST_TIMEOUT_MS = 5000

// --- Shared singleton state -------------------------------------------------
// Module-level refs so every caller of `useEdgeStatus()` shares one poll instead
// of running its own. Two components mount this; without sharing they ran two
// independent /api/edge-status loops. Mirrors `useSiteConfig`.
const data = ref<EdgeStatusData | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

// --- Poll lifecycle ---------------------------------------------------------
let intervalId: ReturnType<typeof setInterval> | null = null
let currentController: AbortController | null = null
let isFetching = false

/**
 * Live subscriber count. The interval and the document `visibilitychange`
 * listener exist only while this is greater than zero; the 0→1 and 1→0
 * transitions own all setup and teardown so neither is ever leaked.
 */
let subscribers = 0

async function fetchStatus(): Promise<void> {
  // In-flight dedup, AbortController, and timeout are all new here — lifted from
  // `useLatency`, which already had them. A manual `refresh()` landing on top of
  // an interval tick must not open a second parallel request.
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
    const response = await fetch('/api/edge-status', {
      signal: currentController.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const json = await response.json() as { success: boolean; data?: EdgeStatusData; error?: { message: string } }

    if (!json.success || !json.data) {
      throw new Error(json.error?.message ?? 'Unknown error')
    }

    data.value = json.data
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      error.value = 'Timeout'
    } else {
      error.value = e instanceof Error ? e.message : 'Failed to fetch edge status'
    }
    data.value = null
  } finally {
    clearTimeout(timeoutId)
    currentController = null
    isFetching = false
    isLoading.value = false
  }
}

function startInterval() {
  stopInterval()
  intervalId = setInterval(fetchStatus, POLL_INTERVAL_MS)
}

function stopInterval() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function handleVisibilityChange() {
  // Stop the interval while the tab is hidden; on becoming visible again, fire
  // one immediate fetch so a tab that was hidden across several intervals shows
  // current edge data rather than stale, then resume the cadence. Only ever runs
  // while subscribed, since the listener is registered only while subscribed.
  if (document.hidden) {
    stopInterval()
  } else {
    fetchStatus()
    startInterval()
  }
}

function subscribe() {
  subscribers += 1
  if (subscribers > 1) return

  // 0→1: start the shared poll and register the visibility listener (paired with
  // the removal in `unsubscribe`, so it is never leaked). If the tab is already
  // hidden, defer the first fetch to the visibility handler.
  document.addEventListener('visibilitychange', handleVisibilityChange)
  if (!document.hidden) {
    fetchStatus()
    startInterval()
  }
}

function unsubscribe() {
  subscribers -= 1
  if (subscribers > 0) return

  // 1→0: remove the listener, stop the interval, and abort any request still in
  // flight so a hung fetch does not outlive its last subscriber.
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopInterval()
  if (currentController) {
    currentController.abort()
    currentController = null
  }
}

/**
 * Shared, visibility-aware edge-status poll. Every caller receives the same refs
 * and the same 30s loop; the loop starts on the first subscriber, stops when the
 * last one unmounts, and pauses whenever the tab is hidden.
 */
export function useEdgeStatus(): {
  data: Ref<EdgeStatusData | null>
  isLoading: Ref<boolean>
  error: Ref<string | null>
  refresh: () => Promise<void>
} {
  // Guard against being called outside a component setup — see the matching note
  // in `useLatency`. Without an instance we cannot refcount on unmount, so we
  // subscribe once and let the shared poll live for the page.
  if (getCurrentInstance()) {
    onMounted(subscribe)
    onUnmounted(unsubscribe)
  } else {
    subscribe()
  }

  return {
    data,
    isLoading,
    error,
    refresh: fetchStatus,
  }
}
