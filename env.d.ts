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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
