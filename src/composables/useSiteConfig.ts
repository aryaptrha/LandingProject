import { ref } from 'vue'
import { apiGet } from '@/utils/api'
import { bootSiteConfig } from '@/utils/edgeBoot'

export interface SiteConfigData {
  guestbookEnabled: boolean
  guestbookNotice: string | null
  insightsEnabled: boolean
  canvasEnabled: boolean
  canvasNotice: string | null
}

const DEFAULTS: SiteConfigData = {
  guestbookEnabled: true,
  guestbookNotice: null,
  insightsEnabled: true,
  canvasEnabled: true,
  canvasNotice: null,
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

/**
 * Seed from the boot payload the worker streamed into `<head>`.
 *
 * This composable is the one that benefits most from hydration. It fetches once
 * per page load and never polls, so the request it makes is *purely* a cold-start
 * cost — and the flags it carries decide whether whole panels render, which puts it
 * on the critical path for what the first paint looks like.
 *
 * Marking `inFlight` as already-settled rather than merely assigning `config` is
 * what actually removes the request: `useSiteConfig()` starts `load()` only when
 * `inFlight` is null. `refresh()` still performs a real read, so a flag flipped in
 * KV mid-session remains reachable.
 *
 * Absent under `npm run dev`, where the fetch happens as before — see
 * `utils/edgeBoot.ts`.
 */
const bootConfig = bootSiteConfig()
if (bootConfig) {
  config.value = bootConfig
  inFlight = Promise.resolve()
}

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
