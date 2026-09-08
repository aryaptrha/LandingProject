/// <reference types="vite/client" />

/**
 * Client-side env vars.
 *
 * Vite inlines every `VITE_*` value into the shipped bundle, so nothing secret
 * belongs here. The persona backend URL and its API key are worker secrets
 * (`PERSONA_API_URL`, `PERSONA_API_KEY`) declared in `src/worker/types/env.ts`
 * and consumed by `src/worker/routes/chat.ts`.
 */
interface ImportMetaEnv {
  readonly MODE: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  /**
   * Boot payload streamed into `<head>` by the worker, carrying the answers to
   * `/api/edge-status`, `/api/config` and `/api/visitor` so first load does not
   * have to ask for them. Written by `src/worker/services/hydrate.service.ts`,
   * read exactly once by `src/utils/edgeBoot.ts`, which then deletes it.
   *
   * Typed `unknown` on purpose rather than as the payload interface. It arrives as
   * text in the document, and a declared type here would be an assertion the
   * compiler cannot check — it would let a consumer read `window.__EDGE__.edge.colo`
   * with no validation at all. `unknown` makes `edgeBoot.ts`'s field-by-field
   * parsing the only way through.
   *
   * Optional because it is genuinely absent under `npm run dev`, where Vite serves
   * `index.html` with no worker in front of it, and because `edgeBoot.ts` deletes it.
   */
  __EDGE__?: unknown
}
