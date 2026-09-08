import { Hono } from 'hono'
import { gateway, onGatewayError } from './gateway/middleware'
import { edge } from './routes/edge'
import { latency } from './routes/latency'
import { visitor } from './routes/visitor'
import { chat } from './routes/chat'
import { session } from './routes/session'
import { config } from './routes/config'
import { guestbook } from './routes/guestbook'
import { insights } from './routes/insights'
import { weather } from './routes/weather'
import { error } from './utils/response'
import type { AppEnv } from './types/env'

const api = new Hono<AppEnv>()

/*
 * Inbound gateway, registered before every mount so it covers all of them —
 * including the catch-all 404 at the bottom, which is itself worth a log line when
 * something is calling a path that does not exist.
 *
 * Adds a request id, timing headers and one structured log line per request, and
 * catches anything a route throws. It is additive only: it never rewrites a body or
 * a status, and never touches `Cache-Control`. See gateway/middleware.ts, in
 * particular the note on why SSE responses pass through untouched.
 */
api.use('/api/*', gateway())
api.onError(onGatewayError)

// Mount all API routes under /api
api.route('/api', edge)
api.route('/api', latency)
api.route('/api', visitor)
api.route('/api', chat)
api.route('/api', session)

// Third-party-backed. Everything outbound goes through gateway/upstream.ts, which
// owns the timeout, the retry, the KV cache and the circuit breaker — the route
// itself only decides what a failure looks like to the browser.
api.route('/api', weather)

// Storage-backed routes. These are the only ones that touch D1 or KV, and each
// degrades to a 503 naming the missing binding rather than failing the request.
api.route('/api', guestbook)
api.route('/api', insights)
api.route('/api', config)

// Catch-all for unknown API routes
api.all('/api/*', () => {
  return error('Not Found', 'NOT_FOUND', 404)
})

export { api }
