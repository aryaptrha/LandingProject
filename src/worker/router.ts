import { Hono } from 'hono'
import { edge } from './routes/edge'
import { latency } from './routes/latency'
import { visitor } from './routes/visitor'
import { cache } from './routes/cache'
import { error } from './utils/response'

const api = new Hono()

// Mount all API routes under /api
api.route('/api', edge)
api.route('/api', latency)
api.route('/api', visitor)
api.route('/api', cache)

// Catch-all for unknown API routes
api.all('/api/*', () => {
  return error('Not Found', 'NOT_FOUND', 404)
})

export { api }
