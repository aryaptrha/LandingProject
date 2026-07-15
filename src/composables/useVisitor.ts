import { ref, onMounted, onUnmounted } from 'vue'

export interface VisitorData {
  country: string
  city: string
  continent: string
  timezone: string
  language: string
  colo: string
}

export function useVisitor(refreshInterval = 60000) {
  const data = ref<VisitorData | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  let intervalId: ReturnType<typeof setInterval> | null = null

  async function fetchVisitor() {
    isLoading.value = true
    error.value = null

    try {
      const response = await fetch('/api/visitor')

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = await response.json() as { success: boolean; data?: VisitorData; error?: { message: string } }

      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? 'Unknown error')
      }

      data.value = json.data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch visitor info'
      data.value = null
    } finally {
      isLoading.value = false
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh()
    intervalId = setInterval(fetchVisitor, refreshInterval)
  }

  function stopAutoRefresh() {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  onMounted(() => {
    fetchVisitor()
    startAutoRefresh()
  })

  onUnmounted(() => {
    stopAutoRefresh()
  })

  return {
    data,
    isLoading,
    error,
    refresh: fetchVisitor,
  }
}
