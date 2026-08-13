/**
 * Latency status buckets and their presentation, in one place.
 *
 * A pure module rather than a composable — following `utils/sse.ts` and
 * `utils/motion.ts` — because none of this is stateful: bucketing a millisecond
 * reading and mapping that bucket to a colour or label are plain functions of
 * their input, with no reactivity, timers, or lifecycle to own. The polling that
 * *produces* the readings lives in `useLatency`; only the classification is
 * shared here.
 *
 * The thresholds and the status→colour map were previously copy-pasted across
 * `useLatency.ts`, `LatencyIndicator.vue`, `CloudflareEdgeStatus.vue`, and
 * `EdgeNetworkVisualization.vue`. Centralising them means a green packet in the
 * network diagram is guaranteed to mean the same round-trip band as a green dot
 * in the corner indicator, and the 30/80/150 boundaries can never drift apart.
 */

/** The four round-trip quality bands, fastest to slowest. */
export type LatencyStatus = 'excellent' | 'good' | 'average' | 'slow'

/**
 * Upper bound (inclusive, in milliseconds) of each band except `slow`, which is
 * everything above `average`. Exported so nothing hardcodes 30/80/150 again.
 */
export const LATENCY_THRESHOLDS = {
  excellent: 30,
  good: 80,
  average: 150,
} as const

/**
 * Classifies a measured round trip into a status band. Boundaries are inclusive
 * (`ms <= threshold`), matching the original `getStatus` in `useLatency`.
 */
export function getLatencyStatus(ms: number): LatencyStatus {
  if (ms <= LATENCY_THRESHOLDS.excellent) return 'excellent'
  if (ms <= LATENCY_THRESHOLDS.good) return 'good'
  if (ms <= LATENCY_THRESHOLDS.average) return 'average'
  return 'slow'
}

/**
 * Maps a status to its design-token colour string, as `var(--*-main)`. Returned
 * as a bare string so it can drop straight into an inline `style` binding
 * (`background` / `color`) the way all three widgets already use it.
 *
 * The `latency.value === null` "no reading yet" fallback (`var(--text-medium)`)
 * stays in each component: it is about the absence of a reading, not about a
 * status, so it has no place in a status→colour map.
 */
export function latencyStatusColor(status: LatencyStatus): string {
  switch (status) {
    case 'excellent':
      return 'var(--green-main)'
    case 'good':
      return 'var(--blue-main)'
    case 'average':
      return 'var(--yellow-main)'
    case 'slow':
      return 'var(--pink-main)'
  }
}

/**
 * Human-readable label for a status — the capitalised band name ("Excellent",
 * "Good", "Average", "Slow"). Kept as `charAt(0).toUpperCase() + slice(1)` so the
 * output is byte-identical to the copy the corner indicator and the edge panel
 * render today. English on purpose: these two widgets label in English, and the
 * network diagram (which shows no status label at all) has nothing to unify.
 */
export function latencyStatusLabel(status: LatencyStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}
