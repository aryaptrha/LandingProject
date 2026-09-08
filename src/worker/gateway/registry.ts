/**
 * Policy for every third-party service this worker is allowed to call.
 *
 * The point of a registry rather than options at the call site: a route should say
 * *what* it wants, not how patient to be about it. Tuning a timeout, widening a
 * cache window, or tightening a breaker is then an edit to one table that can be
 * read top to bottom, instead of a hunt through routes for a magic number.
 *
 * It is also the allowlist. `fetchUpstream` refuses any URL whose origin is not
 * the one declared here, so a bug that lets a query parameter reach the fetch
 * target cannot turn this worker into an open proxy for the internal network —
 * the classic SSRF shape. Adding an upstream is a deliberate edit to this file.
 */

/** Tuning for one upstream. Every field is a decision about how to fail. */
export interface UpstreamPolicy {
  /**
   * Allowlisted origin, scheme included. A request URL must match this exactly
   * (`new URL(url).origin`), so a redirect to another host or an injected
   * absolute URL is refused before a socket opens.
   *
   * Empty string means "not enforceable here" — see `persona` below.
   */
  origin: string
  /**
   * Ceiling on a single attempt, in ms. Not on the whole call: with `retries`
   * above zero the worst case is roughly `(timeoutMs + backoff) * (retries + 1)`,
   * which is what to add up when deciding whether a route can afford it.
   */
  timeoutMs: number
  /**
   * Extra attempts after the first. `fetchUpstream` retries only what a retry can
   * plausibly fix — a network error, a timeout, a 429, or a 5xx. A 4xx is never
   * retried: a rejected key answers 401 every time, and trying again just spends
   * quota to be told the same thing.
   */
  retries: number
  /** Read-through cache window in seconds. 0 disables caching for this upstream. */
  cacheTtlSeconds: number
  breaker: {
    /** Consecutive failures that trip the breaker open. */
    failureThreshold: number
    /** How long it stays open before one request is allowed through to test. */
    cooldownSeconds: number
  }
}

/**
 * The upstreams themselves.
 *
 * `as const satisfies` rather than a plain annotation, so `UpstreamId` below is
 * the literal union of these keys and a typo in a call site is a type error
 * rather than a runtime 500.
 */
export const UPSTREAMS = {
  /**
   * OpenWeather current-conditions API.
   *
   * 4s is generous for one JSON GET and still well inside what a visitor will sit
   * through; one retry covers the single dropped connection that would otherwise
   * blank the panel. The 600s cache is the load-bearing number — it is what keeps
   * a metered free-tier key alive under traffic, and the route pairs it with
   * coordinates rounded to ~1km so nearby visitors share one entry.
   */
  openweather: {
    origin: 'https://api.openweathermap.org',
    timeoutMs: 4000,
    retries: 1,
    cacheTtlSeconds: 600,
    breaker: { failureThreshold: 5, cooldownSeconds: 120 },
  },

  /**
   * The Arya persona backend behind /api/chat.
   *
   * Declared, deliberately unused. `routes/chat.ts` still calls it directly, and
   * moving it here is a bigger job than it looks: its origin comes from a secret
   * rather than a constant, so the allowlist above cannot express it, and it
   * answers with an SSE stream, which the cache and the JSON decoding in
   * `fetchUpstream` have no story for. Both are solvable; neither is this change.
   *
   * It sits here anyway so that the next person adding an upstream finds the
   * registry already knowing about every outbound dependency, including the one
   * that has not moved yet. `cacheTtlSeconds: 0` because a chat reply is unique
   * per request — caching one would serve someone else's answer.
   */
  persona: {
    origin: '',
    timeoutMs: 30000,
    retries: 0,
    cacheTtlSeconds: 0,
    breaker: { failureThreshold: 8, cooldownSeconds: 60 },
  },
} as const satisfies Record<string, UpstreamPolicy>

/** Keys of `UPSTREAMS`, so a call site cannot name an upstream that does not exist. */
export type UpstreamId = keyof typeof UPSTREAMS
