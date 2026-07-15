import { ref, onMounted, onUnmounted } from 'vue'

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

export function useEdgeStatus(refreshInterval = 30000) {
  const data = ref<EdgeStatusData | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  let intervalId: ReturnType<typeof setInterval> | null = null

  async function fetchStatus() {
    isLoading.value = true
    error.value = null

    try {
      const response = await fetch('/api/edge-status')

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      data.value = await response.json()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch edge status'
      data.value = null
    } finally {
      isLoading.value = false
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh()
    intervalId = setInterval(fetchStatus, refreshInterval)
  }

  function stopAutoRefresh() {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  onMounted(() => {
    fetchStatus()
    startAutoRefresh()
  })

  onUnmounted(() => {
    stopAutoRefresh()
  })

  return {
    data,
    isLoading,
    error,
    refresh: fetchStatus,
  }
}
