import type { Context, MiddlewareHandler } from 'hono'
import { error } from '../utils/response'
import type { AppEnv } from '../types/env'

/**
 * Inbound half of the gateway: one middleware every `/api/*` request passes
 * through, on the way in and on the way out.
 *
 * `upstream.ts` is about calls this worker *makes*. This is about calls it
 * *receives*, and it exists because until now nothing here could answer the
 * question "what happened to request X?". A 500 from a route was a bare Hono
 * stack in the tail of `wrangler tail`, with no id to correlate it against, no
 * duration, and no record that the request had happened at all unless the route
 * itself thought to log.
 *
 * Four jobs, in order of how often they matter:
 *
 *   1. A request id on every response, so a visitor's report ("it broke at
 *      14:32") can be tied to a log line.
 *   2. Timing, as `Server-Timing` — which browser devtools render natively in the
 *      network panel, so it costs nothing to read.
 *   3. One structured log line per request.
 *   4. A single place where an unexpected throw becomes a well-formed envelope.
 *
 * ## What it deliberately does not do
 *
 * **It never touches `Cache-Control`.** `utils/response.ts` sets `no-store` on
 * every envelope and is the only thing allowed to have an opinion about caching.
 * A middleware that also wrote cache headers would make the effective policy
 * depend on ordering.
 *
 * **No CORS.** The SPA and the API are the same origin, so there is nothing to
 * allow, and adding an origin check to POST would put the live guestbook, session
 * and chat flows at risk to defend against nothing.
 *
 * **No body inspection, in either direction.** Reading a request body here would
 * consume it before the route saw it, and reading a response body would break
 * streaming. See the SSE note on `finalize()`.
 */

/** Header the request id is echoed on. */
const REQUEST_ID_HEADER = 'X-Request-Id'

/**
 * Headers added to every non-streaming API response.
 *
 * All three are additive hardening, not policy changes — nothing here can alter
 * what a route decided to return:
 *
 *   - `nosniff`: these responses are always JSON, so there is no case where
 *     letting a browser guess a different type is useful, and one where it is
 *     dangerous.
 *   - `no-referrer`: an API path can carry identifiers; no third party needs to
 *     learn them from a Referer header.
 *   - `same-origin` CORP: keeps another site from embedding an API response as a
 *     subresource. Safe here precisely because the SPA is same-origin.
 *
 * `Vary: Origin` is handled separately below, appended rather than set, so a route
 * that already varies on something keeps it.
 */
const HARDENING: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

/**
 * Derives the id for one request.
 *
 * `cf-ray` first, because Cloudflare already generated it and already logs
 * against it — reusing it means a line in this worker's output and a line in the
 * account's own request logs name the same request. `crypto.randomUUID()` only
 * covers the case where there is no edge in front (local `wrangler dev`).
 */
function requestIdFor(request: Request): string {
  return request.headers.get('cf-ray') ?? crypto.randomUUID()
}

/**
 * Appends a value to a comma-separated header without duplicating it.
 *
 * Used for `Vary` and `Server-Timing`, both of which are lists that another layer
 * may have contributed to already.
 */
function appendListHeader(headers: Headers, name: string, value: string): void {
  const existing = headers.get(name)
  if (!existing) {
    headers.set(name, value)
    return
  }
  const present = existing
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .includes(value.trim().toLowerCase())
  if (!present) headers.set(name, `${existing}, ${value}`)
}

/**
 * Rebuilds a response with the gateway's headers attached.
 *
 * ## The streaming case, which is the one real hazard here
 *
 * `routes/chat.ts` proxies an SSE stream straight through from the persona
 * backend. That response is a live `ReadableStream` whose headers were chosen
 * deliberately (`text/event-stream`, `X-Accel-Buffering: no`), and it is the one
 * thing on this API that a wrapper could plausibly break. So it is returned
 * untouched — no new `Response`, no added headers.
 *
 * ## The WebSocket case, which a wrapper cannot survive at all
 *
 * `routes/canvas.ts` answers `/api/canvas/socket` with the 101 the Durable Object
 * produced. That one is not a risk to be weighed but an impossibility: workerd
 * refuses `new Response(body, { status: 101 })` outright unless the init also
 * carries a `webSocket`, and the accepted socket hangs off the response *object*
 * rather than its body — so rebuilding would drop the connection even if the
 * constructor allowed it. Returned untouched, like the stream.
 *
 * Losing a request id on the chat stream is a fair price for not risking the
 * stream; every other route on the API gets one. The same applies to the upgrade,
 * which has no body to put a header on anyway.
 *
 * For everything else, the body is passed to the new `Response` **by reference
 * and unread**. Nothing here awaits, decodes, or clones it — a middleware that
 * buffered response bodies to measure them would turn every streamed response
 * into a fully-materialised one.
 */
function finalize(response: Response, requestId: string, ms: number): Response {
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    return response
  }

  // Both conditions, not just one: `webSocket` is what must not be lost, and 101 is
  // what the `Response` constructor below would reject. Either alone would be a
  // narrower guard than the hazard.
  if (response.status === 101 || response.webSocket) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set(REQUEST_ID_HEADER, requestId)
  headers.set('X-Response-Time', `${ms}ms`)
  for (const [name, value] of Object.entries(HARDENING)) headers.set(name, value)
  appendListHeader(headers, 'Vary', 'Origin')
  // Devtools reads this straight out of the network panel, so it costs a reader
  // nothing. `app` is the whole worker-side handling, upstream time included.
  appendListHeader(headers, 'Server-Timing', `app;dur=${ms}`)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * The one 500 an unhandled throw can produce.
 *
 * Carries the request id in a header rather than in the message, so an operator
 * can find the log line while the visitor is told nothing about the internals.
 * The message is Indonesian to match the rest of the user-facing API copy.
 */
function internalError(requestId: string): Response {
  return error('Ada yang error di server. Coba lagi sebentar lagi ya.', 'INTERNAL_ERROR', 500, {
    [REQUEST_ID_HEADER]: requestId,
  })
}

/**
 * Emits the per-request log line.
 *
 * A single `console.log(JSON.stringify(...))` because `wrangler tail` and Logpush
 * both treat one line as one event; a multi-line or multi-call log is unqueryable.
 *
 * ## What is not in it
 *
 * No IP — `ratelimit.service.ts` already establishes that this codebase hashes
 * addresses rather than storing them, and a log line is storage.
 *
 * No query string and no body. `url.pathname` only: a query can carry a session
 * token or a search term, and once either is in a log it is in every downstream
 * copy of that log.
 */
function logRequest(fields: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify(fields))
  } catch {
    // A field that will not serialise must not cost the visitor their response.
  }
}

/**
 * Registers the inbound gateway. Mount above the route mounts in `router.ts`.
 */
export function gateway(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const started = Date.now()
    const requestId = requestIdFor(c.req.raw)
    // Published on the context so `onGatewayError` can reuse this exact id rather
    // than minting a second one. See `AppEnv['Variables']`.
    c.set('requestId', requestId)
    // Read once, before the route runs: `cf` is on the incoming request, and this
    // keeps the log line's shape independent of what the route did with it.
    const colo = c.req.raw.cf?.colo ?? 'unknown'

    // A failed request and a successful one leave here with the same headers and
    // the same single log line. Getting there takes two paths, because Hono runs
    // `api.onError` *inside* `next()`: a route throw is converted to a response
    // before control returns, so it arrives as `c.res` with the error left on the
    // context, and never as an exception. The `catch` is not dead code, though —
    // it still covers a throw `onError` itself could not handle.
    let response: Response
    let threw: unknown = null
    try {
      await next()
      response = c.res
      threw = c.get('gatewayError') ?? null
    } catch (err) {
      threw = err
      response = internalError(requestId)
    }

    const ms = Date.now() - started
    const finalized = finalize(response, requestId, ms)

    logRequest({
      at: 'api',
      id: requestId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: finalized.status,
      ms,
      colo,
      // Present only on the routes that answer from KV, which is exactly where the
      // hit ratio is worth watching.
      cache: finalized.headers.get('X-Cache') ?? undefined,
      error: threw ? (threw instanceof Error ? threw.message : String(threw)) : undefined,
    })

    // The stack is logged separately and only when there is one: it is multi-line,
    // so folding it into the JSON above would stop that line parsing as one event.
    if (threw instanceof Error && threw.stack) {
      console.error(`[${requestId}] unhandled error`, threw.stack)
    }

    c.res = finalized
  }
}

/**
 * Handler for `api.onError`, and the only thing a route throw actually reaches.
 *
 * Hono invokes this from inside `next()`, so despite the name this is the ordinary
 * path for a failing route rather than a rare backstop — the middleware's own
 * `catch` sees only what `onError` could not handle. Both cases end in the same
 * envelope; they differ in who gets to log it.
 */
export function onGatewayError(err: Error, c: Context<AppEnv>): Response {
  const requestId = c.get('requestId')

  // The gateway is upstream of this and still on the stack, so hand the error back
  // and let it do the reporting: one JSON line and one stack per request, both
  // keyed to the id the client was given. Logging here as well would file the same
  // failure twice, and — before `requestId` was published on the context — under
  // two different ids, because `requestIdFor` mints a fresh UUID without `cf-ray`.
  if (requestId) {
    c.set('gatewayError', err)
    return internalError(requestId)
  }

  // The gateway never ran: a throw in Hono's own dispatch, or in a middleware
  // mounted above it in `router.ts`. Nothing downstream will log this one, so it
  // is logged here or not at all.
  const fallbackId = c.res?.headers.get(REQUEST_ID_HEADER) ?? requestIdFor(c.req.raw)
  console.error(`[${fallbackId}] unhandled error before gateway`, err.stack ?? err.message)
  return internalError(fallbackId)
}
