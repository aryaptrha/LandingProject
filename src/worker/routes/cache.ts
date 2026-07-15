import { Hono } from 'hono'
import { getCache } from '../services/edge.service'
import { success } from '../utils/response'

const cache = new Hono()

cache.get('/cache', (c) => {
  const data = getCache(c.req.raw)
  return success(data)
})

export { cache }
