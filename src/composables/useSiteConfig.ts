import { ref } from 'vue'
import { apiGet } from '@/utils/api'

export interface SiteConfigData {
  guestbookEnabled: boolean
  guestbookNotice: string | null
  insightsEnabled: boolean
}

const DEFAULTS: SiteConfigData = {
  guestbookEnabled: true,
  guestbookNotice: null,
  insightsEnabled: true,
}

/**
 * Module-level state, shared by every caller.
 *
 * Unlike the other composables, this one is not per-component. Two panels need the
 * same flags and the flags change on a human timescale, so fetching them twice per
 * page load would be two requests for one answer. The refs live here, outside the
 * function, and `useSiteConfig()` hands out the same ones each time.
 */
const config = ref<SiteConfigData>(DEFAULTS)
const isLoading = ref(false)
const error = ref<string | null>(null)

/** In-flight request, so concurrent callers await one fetch instead of racing. */
let inFlight: Promise<void> | null = null

async function load(): Promise<void> {
  isLoading.value = true
  error.value = null

  try {
    config.value = await apiGet<SiteConfigData>('/api/config')
  } catch (e) {
    // Defaults stay in place. This endpoint controls whether features are *hidden*,
    // so failing to read it should leave them visible — a panel that works is a
    // better outcome than a blank page because a flag lookup timed out.
    error.value = e instanceof Error ? e.message : 'Failed to load site config'
    config.value = DEFAULTS
  } finally {
    isLoading.value = false
  }
}

/**
 * Feature flags from KV.
 *
 * Fetched once per page load. Call `refresh()` to force a re-read; nothing does
 * automatically, because the worker already serves this from the edge cache for a
 * minute and polling it would defeat that.
 */
export function useSiteConfig() {
  if (!inFlight) {
    inFlight = load()
  }

  function refresh(): Promise<void> {
    inFlight = load()
    return inFlight
  }

  return {
    config,
    isLoading,
    error,
    refresh,
  }
}
