import { Hono } from 'hono'
import { getLatency } from '../services/edge.service'
import { success } from '../utils/response'

const latency = new Hono()

latency.get('/latency', (c) => {
  const data = getLatency(c.req.raw)
  return success(data)
})

export { latency }
