import { ref, readonly, onMounted, onUnmounted, getCurrentInstance, type Ref } from 'vue'
import { getLatencyStatus, type LatencyStatus } from '@/utils/latency'

export interface LatencyResult {
  ms: number
  status: LatencyStatus
}

/**
 * How often the shared latency poll runs, in milliseconds. The interval is owned
 * by the composable now rather than passed per-call: with a single shared loop
 * there is exactly one correct cadence, and letting each caller name its own is
 * what let three independent /api/latency loops exist in the first place.
 *
 * Note the deliberate behaviour change this bakes in: `EdgeNetworkVisualization`
 * used to poll latency at 30s "for a travel speed, not a live readout", and now
 * gets 20s under the shared poll. Accepted — one loop at 20s is far less total
 * work than three loops, and reconciling per-caller intervals (min-of-requested,
 * refcount-weighted) would add real bookkeeping for no visible gain.
 */
const POLL_INTERVAL_MS = 20000

/**
 * Hard ceiling on a single measurement. Replaces the old per-call `timeout`
 * argument with a fixed internal value so a hung request still has a ceiling.
 */
const REQUEST_TIMEOUT_MS = 5000

/** How many recent successful samples the shared trend retains (D2 sparkline). */
const HISTORY_LIMIT = 20

// --- Shared singleton state -------------------------------------------------
// Declared at module scope, not inside the exported function, so every caller of
// `useLatency()` reads and writes the same refs. Three components mount this;
// without sharing they ran three independent /api/latency loops for one
// endpoint. This mirrors the module-level-refs shape of `useSiteConfig`.
const latency = ref<LatencyResult | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

/**
 * Bounded ring buffer of the most recent successful readings, in milliseconds,
 * oldest first. It lives here — not inside LatencyIndicator — precisely because
 * the trend must be shared: every widget that mounts the poll should see the
 * same history, and a sample must outlive whichever component happened to be
 * mounted when it arrived. Only a *successful* measurement appends; a failed or
 * aborted one is a gap, not a data point, and must not distort the line.
 */
const history = ref<number[]>([])

/**
 * A single stable read-only view over the buffer, created once. Callers get the
 * same wrapper every time; they can render the trend but cannot mutate it, which
 * keeps the append path (below) the only writer.
 */
const historyReadonly = readonly(history)

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

async function measure(): Promise<void> {
  // In-flight dedup: a manual `measure()` landing on top of an interval tick (or
  // a visibility-resume fetch) must not open a second parallel request.
  if (isFetching) return

  // Abort any lingering controller before starting a fresh one. Under normal
  // flow `finally` nulls it, so this is defensive against a torn-down request.
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

  const start = performance.now()

  try {
    const response = await fetch('/api/latency', {
      signal: currentController.signal,
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    // Consume the body so the timing covers the full round trip, not just the
    // headers.
    const json = await response.json() as { success: boolean; data?: unknown; error?: { message: string } }

    if (!json.success) {
      throw new Error(json.error?.message ?? 'Measurement failed')
    }

    const ms = Math.round(performance.now() - start)

    latency.value = {
      ms,
      status: getLatencyStatus(ms),
    }

    // Append only on success. Reassign (rather than mutate) and slice to the cap
    // in one step: this keeps the buffer bounded to the last HISTORY_LIMIT and
    // guarantees the ref reassignment triggers reactivity for the sparkline.
    history.value = [...history.value, ms].slice(-HISTORY_LIMIT)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      error.value = 'Timeout'
    } else {
      error.value = e instanceof Error ? e.message : 'Measurement failed'
    }
    latency.value = null
  } finally {
    clearTimeout(timeoutId)
    currentController = null
    isFetching = false
    isLoading.value = false
  }
}

function startInterval() {
  stopInterval()
  intervalId = setInterval(measure, POLL_INTERVAL_MS)
}

function stopInterval() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function handleVisibilityChange() {
  // Polling is billable work a hidden tab cannot show. Stop the interval while
  // hidden; on becoming visible again, fire one immediate measure so the display
  // is not stale by up to a full interval, then resume the cadence. The listener
  // is only registered while subscribed, so this never runs with zero
  // subscribers.
  if (document.hidden) {
    stopInterval()
  } else {
    measure()
    startInterval()
  }
}

function subscribe() {
  subscribers += 1
  if (subscribers > 1) return

  // 0→1: bring the shared poll to life. Register the visibility listener here,
  // and only here, paired with the removal in `unsubscribe`, so a document
  // listener is never leaked once the last subscriber leaves. If the tab is
  // already hidden at this instant, defer the first fetch to the visibility
  // handler rather than polling behind a hidden tab.
  document.addEventListener('visibilitychange', handleVisibilityChange)
  if (!document.hidden) {
    measure()
    startInterval()
  }
}

function unsubscribe() {
  subscribers -= 1
  if (subscribers > 0) return

  // 1→0: tear everything down. Remove the listener (paired with subscribe's
  // add), stop the interval, and abort any request still in flight so a hung
  // fetch does not outlive its last subscriber.
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopInterval()
  if (currentController) {
    currentController.abort()
    currentController = null
  }
}

/**
 * Shared, visibility-aware latency poll. Every caller receives the same refs and
 * the same 20s loop; the loop starts on the first subscriber and stops when the
 * last one unmounts, and pauses whenever the tab is hidden.
 *
 * `history` is a read-only ring buffer of the most recent successful readings in
 * milliseconds (oldest first, ≤ 20 entries) for the trend sparkline.
 */
export function useLatency(): {
  latency: Ref<LatencyResult | null>
  isLoading: Ref<boolean>
  error: Ref<string | null>
  measure: () => Promise<void>
  history: Readonly<Ref<readonly number[]>>
} {
  // `onMounted`/`onUnmounted` warn and no-op if called with no active component
  // instance. Guard with `getCurrentInstance()` so this composable is still safe
  // to call from a plain module. In that case we cannot refcount — there is no
  // unmount event to release on — so we subscribe once and let the shared poll
  // live for the page. (The visibility pause still applies, so an idle
  // background tab is not billed.)
  if (getCurrentInstance()) {
    onMounted(subscribe)
    onUnmounted(unsubscribe)
  } else {
    subscribe()
  }

  return {
    latency,
    isLoading,
    error,
    measure,
    history: historyReadonly,
  }
}
