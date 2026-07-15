import { ref, onMounted, onUnmounted } from 'vue'

export interface LatencyResult {
  ms: number
  status: 'excellent' | 'good' | 'average' | 'slow'
}

function getStatus(ms: number): LatencyResult['status'] {
  if (ms <= 30) return 'excellent'
  if (ms <= 80) return 'good'
  if (ms <= 150) return 'average'
  return 'slow'
}

export function useLatency(interval = 20000, timeout = 5000) {
  const latency = ref<LatencyResult | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  let intervalId: ReturnType<typeof setInterval> | null = null
  let currentController: AbortController | null = null
  let isFetching = false

  async function measure() {
    // Prevent duplicate requests
    if (isFetching) return

    // Abort any lingering request
    if (currentController) {
      currentController.abort()
    }

    isFetching = true
    isLoading.value = true
    error.value = null
    currentController = new AbortController()

    const timeoutId = setTimeout(() => {
      currentController?.abort()
    }, timeout)

    const start = performance.now()

    try {
      const response = await fetch('/api/edge-status', {
        signal: currentController.signal,
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // Consume body to complete the full round trip
      await response.json()

      const end = performance.now()
      const ms = Math.round(end - start)

      latency.value = {
        ms,
        status: getStatus(ms),
      }
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
    intervalId = setInterval(measure, interval)
  }

  function stopInterval() {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  onMounted(() => {
    measure()
    startInterval()
  })

  onUnmounted(() => {
    stopInterval()
    if (currentController) {
      currentController.abort()
      currentController = null
    }
  })

  return {
    latency,
    isLoading,
    error,
    measure,
  }
}
