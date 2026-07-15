import { Hono } from 'hono'
import { getEdgeStatus } from '../services/edge.service'
import { success } from '../utils/response'

const edge = new Hono()

edge.get('/edge-status', (c) => {
  const data = getEdgeStatus(c.req.raw)
  return success(data)
})

export { edge }
