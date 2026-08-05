/**
 * Worker bindings (wrangler vars, secrets, and resource bindings).
 *
 * Distinct from `import.meta.env.VITE_*`, which is inlined into the client bundle
 * at build time. Anything secret belongs here, never in a VITE_ var.
 */
export interface Env {
  ASSETS: Fetcher
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
}

/** Hono generic for routes that need typed access to `c.env`. */
export type AppEnv = { Bindings: Env }
