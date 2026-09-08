import { api } from './router'
import { hydrateDocument, isHtmlDocument } from './services/hydrate.service'
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

    // Serve static assets (Vue app) for everything else.
    //
    // Which requests even reach this line is decided by `run_worker_first` in
    // wrangler.toml, not here: by default the asset server answers any request
    // matching a file and the worker is never invoked, so in practice this handles
    // the document plus anything that matches no file (404s). Asset cache headers
    // are therefore set in `public/_headers` — worker code cannot see an asset
    // request to set them on, and routing assets through here to do so would cost
    // an invocation each for a header a static file sets for free.
    const response = await env.ASSETS.fetch(request)

    // Stream the edge boot payload into the document, which lets the client skip
    // /api/edge-status, /api/config and /api/visitor on first load. Guarded on
    // 200 + text/html, so images, the manifest and 404s fall through untouched.
    // See services/hydrate.service.ts, including why this response becomes
    // `private, no-store`.
    if (isHtmlDocument(response)) {
      return hydrateDocument(response, request, env, ctx)
    }

    return response
  },
} satisfies ExportedHandler<Env>
