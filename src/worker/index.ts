import { api } from './router'

export interface Env {
  ASSETS: Fetcher
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Route /api/* requests through Hono
    if (url.pathname.startsWith('/api/')) {
      return api.fetch(request)
    }

    // Serve static assets (Vue app) for everything else
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
