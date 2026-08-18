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
    const response = await env.ASSETS.fetch(request)
    if (url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/assets/')) {
      const headers = new Headers(response.headers)
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    return response
  },
} satisfies ExportedHandler<Env>
