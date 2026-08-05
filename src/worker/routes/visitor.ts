import { Hono } from 'hono'
import { getVisitor, readGeo } from '../services/edge.service'
import { logVisitOnce } from '../services/insights.service'
import { buildSessionCookie, resolveSession } from '../services/session.service'
import type { AppEnv } from '../types/env'
import { readStorage } from '../utils/bindings'
import { success } from '../utils/response'

const visitor = new Hono<AppEnv>()

/**
 * GET /api/visitor
 *
 * The response body is unchanged — the caller's own geo, read straight off the
 * `cf` object, no storage involved. What is new is a side effect: this request is
 * also where a visit gets recorded, because it is already the one request every
 * visitor makes.
 *
 * The write happens in `waitUntil`, after the response has been sent, so the
 * endpoint stays exactly as fast as it was. If storage is unbound, or the write
 * fails, or the session was already counted, the visitor sees no difference.
 */
visitor.get('/visitor', (c) => {
  const data = getVisitor(c.req.raw)
  const session = resolveSession(c.req.raw)
  const storage = readStorage(c.env)

  if (storage) {
    // `logVisitOnce` handles its own errors and returns rather than rejecting, so
    // this promise never needs a `.catch`. Deduped in KV — see the service for why
    // a 60-second poll would otherwise log a row a minute per open tab.
    const logging = logVisitOnce(
      storage.db,
      storage.kv,
      session.id,
      readGeo(c.req.raw),
      Date.now(),
    )

    try {
      c.executionCtx.waitUntil(logging)
    } catch {
      // `c.executionCtx` throws when the worker was invoked without one, which
      // happens in tests. The promise is already running; letting it float is
      // correct here precisely because it cannot reject.
    }
  }

  // Minted on first visit and reused after, which is what makes the unique-visitor
  // count mean anything. Only sent when new, so the common case adds no header.
  const headers: Record<string, string> = {}
  if (session.isNew) {
    headers['Set-Cookie'] = buildSessionCookie(session.id)
  }

  return success(data, 200, headers)
})

export { visitor }
