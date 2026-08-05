import type { CountBucket } from '../types/data'

/**
 * Readers for D1 aggregate results.
 *
 * `batch<T>()` applies one type parameter across statements that return different
 * shapes, so the honest type for a mixed batch is `Record<string, unknown>` and
 * the narrowing has to happen here. `noUncheckedIndexedAccess` is on, which is
 * why every index access below is guarded rather than asserted.
 */

/**
 * Pulls a numeric scalar out of a single-row aggregate result.
 *
 * Returns 0 for a missing row or a non-numeric column. A COUNT over an empty
 * table is genuinely 0, and a dashboard that renders 0 is better than one that
 * throws.
 */
export function readScalar(
  result: D1Result<Record<string, unknown>> | undefined,
  column: string,
): number {
  const row = result?.results?.[0]
  const value = row?.[column]
  return typeof value === 'number' ? value : 0
}

/**
 * Maps a `SELECT <col> AS key, COUNT(*) AS count` result into buckets.
 *
 * `flatMap` with an empty array drops any row whose columns are not the expected
 * types, so one odd row cannot poison the whole panel.
 */
export function readBuckets(
  result: D1Result<Record<string, unknown>> | undefined,
): CountBucket[] {
  const rows = result?.results ?? []

  return rows.flatMap((row) => {
    const key = row.key
    const count = row.count
    if (typeof key !== 'string' || typeof count !== 'number') return []
    return [{ key, count }]
  })
}
