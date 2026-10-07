import { onMounted, ref } from 'vue'
import { ApiError, apiGet } from '@/utils/api'

// Mirrors of `RunSplit` / `RunTrainingEffect` / `PublicRun` / `RunsData` in
// src/worker/types/data.ts. Restated rather than imported because tsconfig.app.json
// excludes src/worker/** — see the note on `WeatherData` in useWeather.ts. Kept
// field-for-field identical.

export interface RunSplit {
  distanceKm: number
  duration: string
  pace: string | null
  avgHr: number | null
  cadence: number | null
  strideLengthM: number | null
  verticalOscillationCm: number | null
  verticalRatio: number | null
  groundContactMs: number | null
  avgPower: number | null
  elevationGainM: number | null
}

export interface RunTrainingEffect {
  aerobic: number | null
  anaerobic: number | null
  label: string | null
}

export interface PublicRun {
  date: string
  distanceKm: number
  duration: string
  pace: string | null
  avgHr: number | null
  maxHr: number | null
  cadence: number | null
  maxCadence: number | null
  elevationGainM: number | null
  strideLengthM: number | null
  verticalOscillationCm: number | null
  verticalRatio: number | null
  groundContactMs: number | null
  avgPower: number | null
  trainingEffect: RunTrainingEffect | null
  trainingLoad: number | null
  hrZones: string[] | null
  splits: RunSplit[] | null
}

export interface RunsData {
  runs: PublicRun[]
  generatedAt: string | null
  timezone: string
}

/**
 * Seconds in a `"M:SS"` or `"H:MM:SS"` string, the format the Garmin sync writes
 * every duration in. Null for anything else, so a malformed value drops out of a
 * chart instead of drawing as zero.
 */
export function durationToSeconds(value: string | null | undefined): number | null {
  if (!value) return null
  const parts = value.split(':').map(Number)
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) return null
  return parts.reduce((total, part) => total * 60 + part, 0)
}

/** Seconds per km in a `"M:SS/km"` pace string. */
export function paceToSeconds(value: string | null | undefined): number | null {
  return durationToSeconds(value?.replace(/\/km$/, ''))
}

/**
 * The three latest runs from the Garmin snapshot.
 *
 * One fetch per mount and no polling, the way `useInsights` does it: the snapshot
 * changes every two hours at most, and the route lets the browser cache it for
 * five minutes, so a timer would mostly re-read the browser's own copy.
 */
export function useRuns() {
  const data = ref<RunsData | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  /** Set when the worker has no stats to offer at all, so the panel hides rather than errors. */
  const isDisabled = ref(false)

  async function fetchRuns() {
    isLoading.value = true
    error.value = null

    try {
      data.value = await apiGet<RunsData>('/api/runs')
      isDisabled.value = false
    } catch (e) {
      // Unbound namespace or a snapshot format this deploy predates: neither is
      // something a retry can fix, so neither gets an error box.
      if (e instanceof ApiError && e.code === 'RUNS_UNAVAILABLE') {
        isDisabled.value = true
        error.value = null
        data.value = null
      } else {
        // Keep the runs already on screen. A refresh that fails should leave the
        // panel showing what it had, with a notice, not blank it.
        error.value = e instanceof Error ? e.message : 'Gagal memuat data lari'
      }
    } finally {
      isLoading.value = false
    }
  }

  onMounted(fetchRuns)

  return {
    data,
    isLoading,
    isDisabled,
    error,
    refresh: fetchRuns,
  }
}
