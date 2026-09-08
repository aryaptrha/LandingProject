/**
 * Worker bindings (wrangler vars, secrets, and resource bindings).
 *
 * Distinct from `import.meta.env.VITE_*`, which is inlined into the client bundle
 * at build time. Anything secret belongs here, never in a VITE_ var.
 */
export interface Env {
  ASSETS: Fetcher
  /**
   * D1 database holding the guestbook and the visit log.
   *
   * Optional on purpose. The binding resolves only once the database exists on the
   * account and its `database_id` is in wrangler.toml, so a fresh clone or a
   * half-finished setup would otherwise crash on first use. Typed optional, every
   * caller has to handle its absence — see utils/bindings.ts, which turns that into
   * one 503 with the missing binding named, and leaves the rest of the site alone.
   */
  DB?: D1Database
  /**
   * KV namespace used as the read cache, the rate-limit counter, and the runtime
   * config store. Optional for the same reason as `DB`.
   */
  CACHE?: KVNamespace
  /** Base URL or full endpoint of the external Arya persona backend. Set via `wrangler secret put`. */
  PERSONA_API_URL?: string
  /** Optional bearer token for the persona backend. Stays server-side, never in the bundle. */
  PERSONA_API_KEY?: string
  /**
   * Origin to present to the persona backend, which enforces an origin allowlist.
   * Defaults to the worker's own origin, which is correct in production. Needed
   * locally, where the worker's origin is 127.0.0.1 and would be rejected.
   */
  PERSONA_ORIGIN?: string
  /**
   * Cloudflare Turnstile secret key for bot verification.
   * Set via `wrangler secret put TURNSTILE_SECRET_KEY` or in `.dev.vars`.
   */
  TURNSTILE_SECRET_KEY?: string
  /**
   * Optional dedicated secret key for signing X-Session-Token.
   * Defaults to TURNSTILE_SECRET_KEY if not specified.
   */
  SESSION_SECRET?: string
  /**
   * Comma-separated list of allowed hostnames for Turnstile verification (e.g. "localhost,127.0.0.1,aryaptrha.pages.dev").
   * Optional; when set, prevents token reuse across different hostnames.
   */
  TURNSTILE_HOSTNAMES?: string
  /**
   * OpenWeather API key for `GET /api/weather`.
   *
   * A secret (`wrangler secret put OPENWEATHER_API_KEY`, or `.dev.vars` locally),
   * never a `VITE_` var: Vite inlines those into the client bundle, which would
   * publish the key to anyone who opens devtools and hand them a metered quota to
   * spend. Optional like the rest — absent, `/api/weather` answers 503
   * `WEATHER_UNCONFIGURED` and the panel hides itself.
   */
  OPENWEATHER_API_KEY?: string
}

/** Hono generic for routes that need typed access to `c.env`. */
export type AppEnv = {
  Bindings: Env
  /**
   * Set by the inbound gateway, read by its error backstop, and vice versa. Both
   * exist because Hono's `onError` and the gateway middleware each hold half of
   * what one log line needs.
   */
  Variables: {
    /**
     * The id minted once per request in `gateway()`.
     *
     * Stashed so `onGatewayError` reuses it instead of calling `requestIdFor`
     * again: without a `cf-ray` header that helper mints a fresh UUID, which would
     * file the stack trace under a different id than both the request's log line
     * and the `X-Request-Id` the client was given.
     */
    requestId?: string
    /**
     * A route's throw, travelling the other way.
     *
     * Hono runs `onError` inside `next()`, so a route error is already a finished
     * response by the time control returns to the middleware — its `catch` never
     * sees one. The handler leaves the error here so the request's single log line
     * can still name what failed.
     */
    gatewayError?: Error
  }
}
