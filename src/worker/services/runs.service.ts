import type { PublicRun, RunSplit, RunTrainingEffect, RunsData } from '../types/data'

/**
 * The latest runs, read out of the persona backend's Garmin snapshot.
 *
 * The snapshot is written by aryaptrha/personal-chat (`scripts/garmin-sync/sync.py`)
 * and its shape is owned there — `src/services/runningStats.ts` in that repo is the
 * reference copy. This module is the one place in this repo that knows that shape,
 * and it reads defensively for that reason: every field is checked and copied by
 * name, so a snapshot from an older sync (missing fields) or a newer one (extra
 * fields) degrades to nulls instead of breaking the page or publishing something
 * nobody decided to publish.
 *
 * Only runs ever reach the snapshot — the sync drops walks, rides and every other
 * activity type before writing — so there is nothing to filter here, only to cut.
 */

/** The one key the sync writes. */
export const RUNNING_STATS_KEY = 'running-stats'

/**
 * The snapshot version this reader understands. The sync bumps it together with
 * the persona backend's reader; a version this file has not seen is refused rather
 * than guessed at, because a misread shape renders as confident nonsense.
 */
const SNAPSHOT_VERSION = 1

/** How many runs the panel shows. The snapshot keeps five; three fit the slot row. */
export const RECENT_RUN_LIMIT = 3

/**
 * Edge-cache window for the KV read, in seconds.
 *
 * Deliberately the 60s floor rather than something longer. The data only changes
 * every two hours, but one of those changes is the owner pressing Sync and then
 * looking at the page — this, plus the route's five-minute browser cache, keeps
 * that wait to a few minutes at worst.
 */
const KV_CACHE_TTL_SECONDS = 60

/** What the sync uses when it is not told otherwise; used here only when the field is absent. */
const DEFAULT_TIMEZONE = 'Asia/Jakarta'

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Thrown for a snapshot written in a shape this reader does not know. */
export class UnsupportedSnapshotError extends Error {
  constructor(version: unknown) {
    super(`Unsupported running-stats snapshot version: ${String(version)}`)
    this.name = 'UnsupportedSnapshotError'
  }
}

type Raw = Record<string, unknown>

function asObject(value: unknown): Raw | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function toSplit(value: unknown): RunSplit | null {
  const raw = asObject(value)
  if (!raw) return null
  const distanceKm = asNumber(raw.distanceKm)
  const duration = asString(raw.duration)
  if (distanceKm === null || !duration) return null

  return {
    distanceKm,
    duration,
    pace: asString(raw.pace),
    avgHr: asNumber(raw.avgHr),
    cadence: asNumber(raw.cadence),
    strideLengthM: asNumber(raw.strideLengthM),
    verticalOscillationCm: asNumber(raw.verticalOscillationCm),
    verticalRatio: asNumber(raw.verticalRatio),
    groundContactMs: asNumber(raw.groundContactMs),
    avgPower: asNumber(raw.avgPower),
    elevationGainM: asNumber(raw.elevationGainM),
  }
}

function toTrainingEffect(value: unknown): RunTrainingEffect | null {
  const raw = asObject(value)
  if (!raw) return null
  const effect = {
    aerobic: asNumber(raw.aerobic),
    anaerobic: asNumber(raw.anaerobic),
    label: asString(raw.label),
  }
  return effect.aerobic === null && effect.anaerobic === null && effect.label === null ? null : effect
}

/** Five duration strings, or null. A partial list would misnumber the zones, so it is dropped. */
function toHrZones(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== 5) return null
  return value.every((zone) => typeof zone === 'string') ? (value as string[]) : null
}

function toSplits(value: unknown): RunSplit[] | null {
  if (!Array.isArray(value)) return null
  const splits = value.map(toSplit).filter((split): split is RunSplit => split !== null)
  return splits.length ? splits : null
}

/**
 * One run, copied field by field. Null when the three fields every view of a run
 * needs — its date, distance and duration — are not all there.
 */
function toPublicRun(value: unknown): PublicRun | null {
  const raw = asObject(value)
  if (!raw) return null
  const date = asString(raw.date)
  const distanceKm = asNumber(raw.distanceKm)
  const duration = asString(raw.duration)
  if (!date || !LOCAL_DATE.test(date) || distanceKm === null || !duration) return null

  return {
    date,
    distanceKm,
    duration,
    pace: asString(raw.pace),
    avgHr: asNumber(raw.avgHr),
    maxHr: asNumber(raw.maxHr),
    cadence: asNumber(raw.cadence),
    maxCadence: asNumber(raw.maxCadence),
    elevationGainM: asNumber(raw.elevationGainM),
    strideLengthM: asNumber(raw.strideLengthM),
    verticalOscillationCm: asNumber(raw.verticalOscillationCm),
    verticalRatio: asNumber(raw.verticalRatio),
    groundContactMs: asNumber(raw.groundContactMs),
    avgPower: asNumber(raw.avgPower),
    trainingEffect: toTrainingEffect(raw.trainingEffect),
    trainingLoad: asNumber(raw.trainingLoad),
    hrZones: toHrZones(raw.hrZones),
    splits: toSplits(raw.splits),
  }
}

/**
 * Reads the snapshot and returns its newest runs.
 *
 * A missing key is not an error: it is what a namespace looks like before the
 * first sync, and the panel has an empty state for it. A KV failure or unparseable
 * JSON propagates — the route turns it into a retryable error — and an unknown
 * version throws `UnsupportedSnapshotError`, which the route treats as "hide".
 */
export async function readRecentRuns(kv: KVNamespace): Promise<RunsData> {
  const snapshot = asObject(
    await kv.get<unknown>(RUNNING_STATS_KEY, { type: 'json', cacheTtl: KV_CACHE_TTL_SECONDS }),
  )
  if (!snapshot) {
    return { runs: [], generatedAt: null, timezone: DEFAULT_TIMEZONE }
  }
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new UnsupportedSnapshotError(snapshot.version)
  }

  const recent = Array.isArray(snapshot.recentRuns) ? snapshot.recentRuns : []
  const runs = recent
    .map(toPublicRun)
    .filter((run): run is PublicRun => run !== null)
    .slice(0, RECENT_RUN_LIMIT)

  return {
    runs,
    generatedAt: asString(snapshot.generatedAt),
    timezone: asString(snapshot.timezone) ?? DEFAULT_TIMEZONE,
  }
}
