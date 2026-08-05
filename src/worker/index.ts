import { api } from './router'
import type { Env } from './types/env'

export type { Env } from './types/env'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Route /api/* requests through Hono. env and ctx must be forwarded, otherwise
    // c.env is undefined inside every route and no binding is reachable.
    if (url.pathname.startsWith('/api/')) {
      return api.fetch(request, env, ctx)
    }

    // Serve static assets (Vue app) for everything else
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
