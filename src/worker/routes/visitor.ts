import { Hono } from 'hono'
import { getVisitor } from '../services/edge.service'
import { success } from '../utils/response'

const visitor = new Hono()

visitor.get('/visitor', (c) => {
  const data = getVisitor(c.req.raw)
  return success(data)
})

export { visitor }
