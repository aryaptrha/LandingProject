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
   * Comma-separated list of allowed hostnames for Turnstile verification (e.g. "localhost,127.0.0.1,aryaptrha.pages.dev").
   * Optional; when set, prevents token reuse across different hostnames.
   */
  TURNSTILE_HOSTNAMES?: string
}

/** Hono generic for routes that need typed access to `c.env`. */
export type AppEnv = { Bindings: Env }
