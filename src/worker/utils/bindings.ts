import type { Env } from '../types/env'

/**
 * Guards for the storage bindings.
 *
 * `DB` and `CACHE` are typed optional in `Env` on purpose. They genuinely can be
 * absent — the D1 database and KV namespace have to be created on the account and
 * their ids pasted into wrangler.toml, and until that happens the worker still
 * deploys and the site still serves. The optional type forces every caller to
 * decide what to do about it instead of discovering it as a null dereference in
 * production.
 *
 * The decision, everywhere: degrade. The static site, the edge widgets, and the
 * chat proxy do not need storage, so a missing binding takes out one panel with a
 * clear message and leaves the rest of the site alone.
 */

/** Both storage bindings, once proven present. */
export interface Storage {
  db: D1Database
  kv: KVNamespace
}

/**
 * Names the bindings that are missing, empty when everything is wired.
 *
 * Returns names rather than a boolean so the error can say *which* one is
 * missing — the difference between "create the KV namespace" and "run the
 * migrations" is otherwise a ten-minute guess.
 */
export function missingBindings(env: Env | undefined): string[] {
  const missing: string[] = []
  if (!env?.DB) missing.push('DB (D1 database)')
  if (!env?.CACHE) missing.push('CACHE (KV namespace)')
  return missing
}

/** Returns both bindings, or null if either is absent. */
export function readStorage(env: Env | undefined): Storage | null {
  if (!env?.DB || !env?.CACHE) return null
  return { db: env.DB, kv: env.CACHE }
}

/** Human-readable 503 body for a route whose storage is not wired up yet. */
export function storageUnavailableMessage(missing: string[]): string {
  return `Storage is not configured for this worker. Missing binding: ${missing.join(', ')}. See docs/DATA.md.`
}
