import { computed, ref } from 'vue'
import { ApiError, apiGet, apiPost } from '@/utils/api'

/**
 * Mirrors `GuestbookEntry` in src/worker/types/data.ts.
 *
 * Declared again rather than imported: the worker is a separate TypeScript project
 * (src/worker/tsconfig.json) and importing across that boundary would pull worker
 * types into the client build. Two things to keep in step deliberately — the geo
 * fields are never null, the worker substitutes the literal `'unknown'`, and
 * `createdAt` is an ISO-8601 string even though D1 stores epoch milliseconds.
 */
export interface GuestbookEntryData {
  id: string
  name: string
  message: string
  avatarId: string
  country: string
  city: string
  colo: string
  createdAt: string
}

export interface GuestbookStatsData {
  total: number
  topCountries: { key: string; count: number }[]
  cached: boolean
}

interface GuestbookPageData {
  entries: GuestbookEntryData[]
  nextCursor: string | null
  cached: boolean
}

export interface GuestbookDraft {
  name: string
  message: string
  avatarId: string
}

/** Mirrors MAX_MESSAGE_LENGTH / MAX_NAME_LENGTH in the worker's guestbook service. */
export const MAX_NAME_LENGTH = 32
export const MAX_MESSAGE_LENGTH = 280

/**
 * Counts characters the way the server does.
 *
 * Spreading into an array counts Unicode code points, so an emoji is 1 and not 2.
 * `String.prototype.length` counts UTF-16 units and would let the counter read 270
 * while the server rejects the message at 280 — the kind of mismatch that looks
 * like a broken form.
 */
export function countChars(value: string): number {
  return [...value].length
}

/**
 * The guestbook, client side.
 *
 * Two things here are deliberate and worth knowing before changing them.
 *
 * First, a successful post prepends the entry the server returned rather than
 * refetching the list. The first page is cached in KV and KV is eventually
 * consistent, so a refetch can legitimately come back without the entry that was
 * just written. Prepending means the author always sees their own message.
 *
 * Second, `servedFrom` is surfaced to the UI on purpose. The point of this feature
 * is to show the storage layer working, and a small "KV / D1" marker turns an
 * invisible cache into something you can watch flip.
 */
export function useGuestbook() {
  const entries = ref<GuestbookEntryData[]>([])
  const stats = ref<GuestbookStatsData | null>(null)
  const nextCursor = ref<string | null>(null)

  const isLoading = ref(false)
  const isLoadingMore = ref(false)
  const isSubmitting = ref(false)

  const error = ref<string | null>(null)
  /** Code behind `error`, so "bindings not wired yet" can read differently from a real fault. */
  const errorCode = ref<string | null>(null)
  const submitError = ref<string | null>(null)
  const submitErrorCode = ref<string | null>(null)

  /** Whether the last list response came from KV or from D1. */
  const servedFrom = ref<'kv' | 'd1' | null>(null)

  const hasMore = computed(() => nextCursor.value !== null)
  const isEmpty = computed(() => !isLoading.value && entries.value.length === 0)

  async function loadEntries() {
    isLoading.value = true
    error.value = null
    errorCode.value = null

    try {
      const page = await apiGet<GuestbookPageData>('/api/guestbook')
      entries.value = page.entries
      nextCursor.value = page.nextCursor
      servedFrom.value = page.cached ? 'kv' : 'd1'
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load guestbook'
      errorCode.value = e instanceof ApiError ? e.code : null
      entries.value = []
      nextCursor.value = null
      servedFrom.value = null
    } finally {
      isLoading.value = false
    }
  }

  async function loadStats() {
    try {
      stats.value = await apiGet<GuestbookStatsData>('/api/guestbook/stats')
    } catch {
      // Silent. The stats line is decoration above the list; the list itself has
      // already reported any real problem and two error messages for one outage
      // would just be noise.
      stats.value = null
    }
  }

  /**
   * Appends the next page.
   *
   * Keyset pagination, so the cursor is the position of the last row rather than an
   * offset — new posts arriving while someone reads cannot shift the page and make
   * an entry appear twice or get skipped.
   */
  async function loadMore() {
    if (!nextCursor.value || isLoadingMore.value) return

    isLoadingMore.value = true
    error.value = null
    errorCode.value = null

    try {
      const page = await apiGet<GuestbookPageData>(
        `/api/guestbook?cursor=${encodeURIComponent(nextCursor.value)}`,
      )
      entries.value = [...entries.value, ...page.entries]
      nextCursor.value = page.nextCursor
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load more entries'
      errorCode.value = e instanceof ApiError ? e.code : null
    } finally {
      isLoadingMore.value = false
    }
  }

  /**
   * Posts an entry. Returns true on success so the caller can clear its form.
   *
   * `submitErrorCode` is set alongside the message because the UI treats the cases
   * differently: a rate limit disables the button for a while, a validation failure
   * just needs the message, and a disabled guestbook should hide the form entirely.
   */
  async function submit(draft: GuestbookDraft): Promise<boolean> {
    if (isSubmitting.value) return false

    isSubmitting.value = true
    submitError.value = null
    submitErrorCode.value = null

    try {
      const created = await apiPost<GuestbookEntryData>('/api/guestbook', draft)

      entries.value = [created, ...entries.value]

      // Kept in step locally rather than refetched: the stats response is cached for
      // five minutes, so a refetch here would usually return the old total and make
      // the counter disagree with the list the visitor is looking at.
      if (stats.value) {
        stats.value = { ...stats.value, total: stats.value.total + 1 }
      }

      return true
    } catch (e) {
      submitError.value = e instanceof Error ? e.message : 'Failed to post message'
      submitErrorCode.value = e instanceof ApiError ? e.code : null
      return false
    } finally {
      isSubmitting.value = false
    }
  }

  /** Loads list and stats together — two independent requests, one round trip of latency. */
  async function refresh() {
    await Promise.all([loadEntries(), loadStats()])
  }

  return {
    entries,
    stats,
    servedFrom,
    isLoading,
    isLoadingMore,
    isSubmitting,
    isEmpty,
    hasMore,
    error,
    errorCode,
    submitError,
    submitErrorCode,
    loadMore,
    submit,
    refresh,
  }
}
