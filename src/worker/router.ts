import { Hono } from 'hono'
import { edge } from './routes/edge'
import { latency } from './routes/latency'
import { visitor } from './routes/visitor'
import { chat } from './routes/chat'
import { config } from './routes/config'
import { guestbook } from './routes/guestbook'
import { insights } from './routes/insights'
import { error } from './utils/response'
import type { AppEnv } from './types/env'

const api = new Hono<AppEnv>()

// Mount all API routes under /api
api.route('/api', edge)
api.route('/api', latency)
api.route('/api', visitor)
api.route('/api', chat)

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
