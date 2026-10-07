import { computed, onBeforeUnmount, ref } from 'vue'
import { ApiError, apiGet, apiPost } from '../utils/api'
import { useOwner } from './useOwner'

/**
 * The owner's "Sync Garmin" button: starts the sync workflow through
 * `/api/owner/garmin-sync` and follows the run until it finishes.
 *
 * The worker decides everything that protects the Garmin account (one run at a
 * time, a cooldown, the rate limit); this only reports. Its state lives in the
 * chat header and never in the message list — those messages are persisted and
 * sent back to the LLM as history, and "sync finished" is not something Arya said.
 */

export type GarminSyncPhase =
  | 'idle'
  | 'starting'
  | 'queued'
  | 'running'
  | 'success'
  | 'failure'
  | 'error'

/** What `ChatHeader` renders. `null` from `useGarminSync().view` hides the button. */
export interface GarminSyncView {
  phase: GarminSyncPhase
  busy: boolean
  label: string
  /** The run's page on GitHub, once known. */
  url: string
}

/** Mirrors `SyncRun` in `src/worker/services/garminSync.service.ts`. */
interface SyncRun {
  id: number
  state: 'queued' | 'running' | 'success' | 'failure'
  startedAt: string
  updatedAt: string
  url: string
}

const POLL_MS = 5_000
const POLL_TIMEOUT_MS = 10_000
/** A run takes about a minute; past this, something is stuck and GitHub says what. */
const GIVE_UP_MS = 5 * 60_000
/** How long "updated" stays in the header before it goes back to normal. */
const SUCCESS_LINGER_MS = 30_000

const LABELS: Record<GarminSyncPhase, string> = {
  idle: 'Sync data lari dari Garmin',
  starting: 'Mulai sync Garmin…',
  queued: 'Sync Garmin antre…',
  running: 'Lagi sync Garmin…',
  // KV takes up to about a minute to show the new snapshot everywhere.
  success: 'Data lari ke-update ✓ Bot pakai ±1 menit lagi.',
  failure: 'Sync gagal. Buka log di GitHub.',
  error: 'Sync Garmin gagal.',
}

export function useGarminSync() {
  const { ownerKey, isOwner, forgetOwner } = useOwner()

  const phase = ref<GarminSyncPhase>('idle')
  const message = ref('')
  const runUrl = ref('')

  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let resetTimer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let deadline = 0
  /**
   * Bumped by every stop. A request already in flight when polling stops still
   * settles afterwards — aborted, it even looks like a retryable timeout — so each
   * one checks it still belongs to the current generation before acting.
   */
  let generation = 0

  const busy = computed(() => ['starting', 'queued', 'running'].includes(phase.value))
  const authHeaders = () => ({ Authorization: `Bearer ${ownerKey.value}` })

  function stopPolling(): void {
    generation += 1
    clearTimeout(pollTimer)
    pollTimer = undefined
    controller?.abort()
    controller = undefined
  }

  function finish(next: GarminSyncPhase, text = ''): void {
    stopPolling()
    phase.value = next
    message.value = text
    if (next === 'success') {
      resetTimer = setTimeout(() => {
        phase.value = 'idle'
        message.value = ''
      }, SUCCESS_LINGER_MS)
    }
  }

  function fail(err: unknown): void {
    if (err instanceof ApiError && err.status === 401) {
      // The worker no longer accepts this key (rotated, or never right): this
      // browser is a visitor again, and the button disappears with the key.
      stopPolling()
      forgetOwner()
      phase.value = 'idle'
      return
    }
    if (err instanceof ApiError && err.code === 'COOLDOWN') {
      // Refused because a sync just succeeded, so the data is already fresh.
      finish('success', err.message)
      return
    }
    finish('error', err instanceof ApiError ? err.message : '')
  }

  /** Applies a run's state; true while there is still something to wait for. */
  function applyRun(run: SyncRun | null): boolean {
    if (!run) return true // dispatched, but GitHub has not listed it yet
    if (run.url) runUrl.value = run.url
    if (run.state === 'success' || run.state === 'failure') {
      finish(run.state)
      return false
    }
    phase.value = run.state
    return true
  }

  function schedulePoll(query: string): void {
    const current = generation
    pollTimer = setTimeout(() => void poll(query, current), POLL_MS)
  }

  async function poll(query: string, current: number): Promise<void> {
    if (Date.now() > deadline) {
      finish('error', 'Sync-nya kelamaan. Cek tab Actions di GitHub.')
      return
    }

    const request = new AbortController()
    controller = request
    const timeout = setTimeout(() => request.abort(), POLL_TIMEOUT_MS)
    try {
      const { run } = await apiGet<{ run: SyncRun | null }>(`/api/owner/garmin-sync?${query}`, {
        headers: authHeaders(),
        signal: request.signal,
      })
      if (current !== generation) return
      // Once the run has an id, follow it by id rather than by time.
      if (applyRun(run)) schedulePoll(run ? `runId=${run.id}` : query)
    } catch (err) {
      if (current !== generation) return
      const transient =
        err instanceof ApiError &&
        (err.code === 'TIMEOUT' || err.code === 'NETWORK_ERROR' || err.status === 503)
      // One dropped poll is not a failed sync; the deadline still bounds retrying.
      if (transient) schedulePoll(query)
      else fail(err)
    } finally {
      clearTimeout(timeout)
    }
  }

  async function start(): Promise<void> {
    if (busy.value || !isOwner.value) return

    stopPolling()
    const current = generation
    clearTimeout(resetTimer)
    phase.value = 'starting'
    message.value = ''
    runUrl.value = ''
    deadline = Date.now() + GIVE_UP_MS

    try {
      const result = await apiPost<{ run: SyncRun | null; requestedAt: string | null }>(
        '/api/owner/garmin-sync',
        {},
        { headers: authHeaders() },
      )
      if (current !== generation) return
      const query = result.run
        ? `runId=${result.run.id}`
        : `since=${encodeURIComponent(result.requestedAt ?? new Date().toISOString())}`
      if (applyRun(result.run)) schedulePoll(query)
    } catch (err) {
      if (current !== generation) return
      fail(err)
    }
  }

  onBeforeUnmount(() => {
    stopPolling()
    clearTimeout(resetTimer)
  })

  const view = computed<GarminSyncView | null>(() =>
    isOwner.value
      ? {
          phase: phase.value,
          busy: busy.value,
          label: message.value || LABELS[phase.value],
          url: runUrl.value,
        }
      : null,
  )

  return { view, start }
}
