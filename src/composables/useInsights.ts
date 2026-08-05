import { onMounted, ref } from 'vue'
import { ApiError, apiGet } from '@/utils/api'

export interface CountBucketData {
  key: string
  count: number
}

export interface InsightsData {
  totalVisits: number
  uniqueVisitors: number
  visitsLast24h: number
  topCountries: CountBucketData[]
  topColos: CountBucketData[]
  computedAt: string
  cached: boolean
}

/**
 * Traffic aggregates from D1, cached in KV.
 *
 * No auto-refresh interval, unlike `useEdgeStatus`. The server recomputes this at
 * most once every five minutes and serves KV in between, so polling would produce
 * identical responses and only make the cache-hit ratio look better than it is.
 * `computedAt` is returned so the UI can show the real age instead of implying live
 * data.
 */
export function useInsights() {
  const data = ref<InsightsData | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  /** Set when the panel is switched off in KV, so the UI can hide rather than error. */
  const isDisabled = ref(false)

  async function fetchInsights() {
    isLoading.value = true
    error.value = null

    try {
      data.value = await apiGet<InsightsData>('/api/insights')
      isDisabled.value = false
    } catch (e) {
      // A disabled panel is a decision, not a failure, so it gets its own flag and
      // no error text. Same for missing bindings: the site is simply not wired up
      // yet, which is a state a fresh clone is legitimately in.
      if (e instanceof ApiError && (e.code === 'INSIGHTS_DISABLED' || e.code === 'STORAGE_UNAVAILABLE')) {
        isDisabled.value = true
        error.value = null
      } else {
        error.value = e instanceof Error ? e.message : 'Failed to load insights'
      }
      data.value = null
    } finally {
      isLoading.value = false
    }
  }

  onMounted(fetchInsights)

  return {
    data,
    isLoading,
    isDisabled,
    error,
    refresh: fetchInsights,
  }
}
