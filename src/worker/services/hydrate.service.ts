import type { EdgeStatusData } from '../types/cloudflare'
import type { SiteConfig } from '../types/data'
import type { Env } from '../types/env'
import { readStorage } from '../utils/bindings'
import { DEFAULT_SITE_CONFIG, readSiteConfig } from './config.service'
import { getEdgeStatus, readGeo } from './edge.service'
import { logVisitOnce } from './insights.service'
import { buildSessionCookie, resolveSession } from './session.service'

/**
 * Edge hydration: answering three of the client's first requests inside the
 * document request itself.
 *
 * On a cold load the front end used to open three connections before it could
 * render a populated widget — `/api/edge-status`, `/api/config` and `/api/visitor`
 * — and every one of them asks for something the document request already had or
 * could get for free:
 *
 * | Request | Why it was redundant |
 * | --- | --- |
 * | `/api/edge-status` | `getEdgeStatus()` only reads `request.cf`, which is in memory. |
 * | `/api/config` | one KV read, already served from the colo cache for 60s. |
 * | `/api/visitor` | its only purpose is a `ctx.waitUntil` write we can schedule here. |
 *
 * So the worker streams the answers into `<head>` as a boot payload and the
 * composables read it instead of fetching. `HTMLRewriter` is a transform stream,
 * not a buffer, so this is not a TTFB trade: the bytes before `<head>`'s last
 * child have already left the worker by the time the KV read is awaited.
 *
 * Two things are deliberately *not* hydrated:
 *
 * - **Weather.** `/api/weather` needs an outbound subrequest to OpenWeather.
 *   Blocking the document on a third-party host to save one client fetch is the
 *   wrong direction, and the panel already degrades on its own.
 * - **Latency.** `useLatency` measures a round trip with `performance.now()`.
 *   There is no server-side value to seed; a number invented here would be
 *   misinformation.
 *
 * The client half is `src/utils/edgeBoot.ts`, which re-validates every field. The
 * two halves are intentionally distrustful of each other: this file is the only
 * thing that writes the payload, and that file assumes nothing about what it gets.
 */

/**
 * Name of the global the payload is parked on.
 *
 * Exported so the client reader cannot drift from the writer by a typo. Read once
 * and deleted by `edgeBoot.ts` — it is a boot channel, not application state.
 */
export const BOOT_GLOBAL = '__EDGE__'

/** What the document hands the client. Mirrored by `EdgeBoot` in `src/utils/edgeBoot.ts`. */
export interface EdgeBootPayload {
  /** Identical shape to `GET /api/edge-status`'s `data`, so the seed needs no mapping. */
  edge: EdgeStatusData
  /** Identical shape to `GET /api/config`'s `data`. */
  config: SiteConfig
  /**
   * Whether this document request took over visit logging.
   *
   * "Scheduled", not "written" — the D1 write runs in `ctx.waitUntil` after the
   * response is sent, so its outcome is unknowable at serialisation time and the
   * name is the closest honest word available at this point in the request. When
   * this is false (no D1/KV binding, or no `ExecutionContext`) the client still
   * pings `/api/visitor` and nothing is lost.
   */
  visitLogged: boolean
}

/**
 * U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR, built from their code
 * points rather than written as character literals.
 *
 * Both are invisible in every editor and in every diff. Written literally they
 * would be two characters no reviewer can see and nobody can retype correctly —
 * the kind of source that looks like a redundant no-op replace and gets deleted by
 * someone tidying up. Naming the code point makes the intent greppable.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

/**
 * Serialises the payload for embedding inside an inline `<script>`.
 *
 * This is the one function in the file that has to be exactly right, because the
 * payload carries `guestbookNotice` — a string written by hand from a CLI into KV,
 * which makes it attacker-shaped input the moment that key is ever writable by
 * anyone but the author.
 *
 * `JSON.stringify` alone is **not** enough inside a `<script>`:
 *
 * - A `</script` sequence ends the element regardless of JSON quoting, so the
 *   remainder of the notice would be parsed as HTML. Escaping `<` makes that
 *   sequence unrepresentable. It also rules out `<!--`, which would otherwise
 *   flip the parser into a state where the *next* `</script>` is swallowed.
 * - The two separators above are valid unescaped in JSON but were line terminators
 *   in ECMAScript before ES2019, so a notice containing one could still break a
 *   parser somewhere in the wild. Escaping them costs nothing.
 *
 * `>` and `&` need no escaping in a raw-text element, and are escaped anyway so
 * the result stays safe if this string is ever moved into an attribute or a
 * `<template>`. Every escape emitted here is valid JSON *and* a valid JavaScript
 * string escape, so the parsed value is identical to the input either way.
 *
 * `split`/`join` rather than a regex for the separators, so the pattern needs no
 * escape sequence of its own — see the note on the constants above. Order is
 * irrelevant: no replacement introduces a character another one matches.
 */
export function serialiseBootPayload(payload: EdgeBootPayload): string {
  return JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(LINE_SEPARATOR)
    .join('\\u2028')
    .split(PARAGRAPH_SEPARATOR)
    .join('\\u2029')
}

/**
 * The full `<script>` element to inject.
 *
 * A classic script, not `type="module"`: classic inline scripts run the moment the
 * parser reaches them, whereas `type="module"` is implicitly deferred and does not
 * execute until the document has been parsed. That ordering is what lets `main.ts`
 * treat the payload as already present rather than awaited.
 *
 * Note the ordering does **not** depend on where this lands in the document, which
 * matters because the two differ: `index.html` has the module script last in
 * `<body>`, but Vite hoists it into `<head>` at build time, so in the shipped
 * `dist/index.html` it precedes this injection. Deferral, not position, is what
 * makes that safe — a `<script async>` in the same slot would be a race.
 */
function bootScript(payload: EdgeBootPayload): string {
  return `<script>window.${BOOT_GLOBAL}=${serialiseBootPayload(payload)}</script>`
}

/**
 * Whether a response from `env.ASSETS` is a document worth rewriting.
 *
 * Status 200 **and** `text/html`, so hashed assets, fonts, images and 404s all
 * keep the existing pass-through path untouched. A 304 is not 200 and therefore
 * passes through unrewritten — which is correct rather than merely tolerated,
 * because the rewritten document is `no-store` and so is never in a browser cache
 * to revalidate. The one case it can happen is a copy cached before this feature
 * shipped, and that resolves itself on the next load.
 */
export function isHtmlDocument(response: Response): boolean {
  if (response.status !== 200) return false
  return (response.headers.get('content-type') ?? '').includes('text/html')
}

/**
 * Streams the boot payload into a document response.
 *
 * Synchronous by design: it returns the transformed stream immediately and does
 * the KV read inside the `<head>` handler, so nothing before `</head>` waits on
 * storage. The read is *started* before `transform()` so it overlaps with the
 * bytes already in flight.
 *
 * The payload is appended as `<head>`'s last child rather than prepended. If the
 * KV read is slow the stream pauses at the injection point, and pausing after the
 * font preloads and the stylesheet links have flowed lets the browser fetch them
 * during the pause. Prepending would stall exactly the bytes that matter most.
 *
 * `ctx` is optional so this stays callable without an `ExecutionContext`; without
 * one, visit logging is simply not claimed and the client keeps pinging.
 */
export function hydrateDocument(
  response: Response,
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Response {
  const session = resolveSession(request)

  // Visit logging moves off the client and onto this request. The existing
  // `visit:seen:<sid>` KV marker (30 min) already makes it idempotent, so it does
  // not matter that the client may also ping `/api/visitor` during the changeover.
  let visitLogged = false
  const storage = readStorage(env)
  if (storage && ctx) {
    try {
      ctx.waitUntil(
        logVisitOnce(storage.db, storage.kv, session.id, readGeo(request), Date.now()),
      )
      visitLogged = true
    } catch {
      // No usable ExecutionContext. Nothing was scheduled, so nothing is claimed.
      visitLogged = false
    }
  }

  // In flight before `transform()`, and `.catch()`ed here rather than in the
  // handler: an unhandled rejection inside an HTMLRewriter handler aborts the
  // stream mid-document, and a truncated page is far worse than a missing
  // optimisation. `readSiteConfig` already fails open; this is the second net.
  const configPromise = readSiteConfig(env?.CACHE).catch(() => DEFAULT_SITE_CONFIG)
  const edge = getEdgeStatus(request)

  const headers = new Headers(response.headers)

  // Once the document carries the visitor's colo, city and session cookie it is
  // no longer a shared artifact. Workers static assets are served from the same
  // colo either way, so this costs far less than the three round trips it removes.
  headers.set('Cache-Control', 'private, no-store')

  // The body length changes and the entity is no longer the one on disk, so both
  // of these would be lies. Leaving a stale ETag is the worse of the two: it
  // invites a conditional request that would be answered 304 with no payload.
  headers.delete('Content-Length')
  headers.delete('ETag')

  if (session.isNew) {
    headers.append('Set-Cookie', buildSessionCookie(session.id))
  }

  const source = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })

  return new HTMLRewriter()
    .on('head', {
      async element(el) {
        try {
          const config = await configPromise
          el.append(bootScript({ edge, config, visitLogged }), { html: true })
        } catch (err) {
          // Swallowed on purpose, and the only branch that must not rethrow: the
          // response headers are already sent. The client falls back to fetching,
          // which is exactly the `npm run dev` path and therefore well travelled.
          console.error('Edge hydration injection failed:', err)
        }
      },
    })
    .transform(source)
}
