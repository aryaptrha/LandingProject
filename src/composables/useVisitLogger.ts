import { apiGet } from '@/utils/api'

/**
 * One-shot visit logging.
 *
 * `GET /api/visitor` carries a side effect the rest of the app never sees: after the
 * response is sent, the worker records the visit in D1 (deduped per session for ~30
 * minutes in KV — see `insights.service.ts`). That write is the *only* data source
 * EdgeInsights has, so something on the page must make the request. Exactly one call
 * per load is enough: inside the KV dedupe window a second call logs nothing, which is
 * why this replaces the old 60-second-polling `useVisitor` — every poll after the
 * first was pure waste.
 *
 * There is no reactive state and no consumer for the response body (the caller's geo),
 * so this is a plain function rather than a `use*` composable returning refs.
 */

// Idempotency guard, scoped to the module and therefore to one page load. It defends
// against a double-count from a double-invocation within a single load — a remount, a
// dev-mode double-fired effect, or two callers — independently of the server-side KV
// dedupe, which covers the cross-reload case. Belt and braces: the two windows differ,
// so both are worth having.
let hasRecorded = false

/**
 * Records this page load as a visit. Fire-and-forget and idempotent per load.
 *
 * Returns immediately; the request is not awaited because the write we care about
 * happens server-side regardless of what the browser does with the response.
 */
export function recordVisit(): void {
  if (hasRecorded) return
  hasRecorded = true

  // apiGet throws ApiError on any failure, and `/api/visitor` degrades quietly when
  // D1/KV are unbound (returning geo but logging nothing), so this catch is mandatory,
  // not optional: an analytics ping must never surface an error to a visitor, break the
  // page, or reject into an unhandled promise. `void` marks the discard as deliberate.
  void apiGet<unknown>('/api/visitor').catch(() => {
    // Swallowed on purpose. Nothing a visitor can or should act on lives here; a failed
    // ping simply means the insights panel counts one fewer visit.
  })
}
