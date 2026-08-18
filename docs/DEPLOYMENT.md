# Deployment

Target: a single Cloudflare Worker that serves the built Vue app as static
assets and handles `/api/*` itself. No Pages project, no separate API host, no
CORS anywhere.

## One-time setup

```bash
npx wrangler login
```

Opens a browser and authorizes Wrangler against your Cloudflare account. On a
headless machine use an API token instead:

```bash
export CLOUDFLARE_API_TOKEN=...    # needs Workers Scripts:Edit
```

Nothing else is needed up front — `wrangler.toml` already declares the worker
name (`aryaptrha-portfolio`), the entry point, the assets directory, and the
`ASSETS` binding.

## Every deploy

```bash
npm run build     # type-check + vite build → dist/
npm run deploy    # wrangler deploy
```

**Run the build.** `npm run deploy` is a bare `wrangler deploy`; it does not
build. Deploying without building uploads whatever `dist/` happens to hold —
stale output, or on a fresh clone, nothing. `npm run build` also runs
`type-check` in parallel and fails the whole thing if types are broken, which is
the only gate this project has before production.

## Secrets

Three worker vars, documented in `wrangler.toml` and in `.dev.vars.example`:

| Secret | Required | Purpose |
| ------ | -------- | ------- |
| `PERSONA_API_URL` | For real chat | Base URL of the persona backend |
| `PERSONA_API_KEY` | Only if upstream needs auth | Bearer token sent upstream |
| `PERSONA_ORIGIN` | **No — omit in production** | Override for the origin presented upstream |
| `TURNSTILE_SECRET_KEY` | For bot verification | Cloudflare Turnstile secret key for server-side siteverify |
| `TURNSTILE_HOSTNAMES` | Optional | Comma-separated allowed hostnames for Turnstile |

```bash
npx wrangler secret put PERSONA_API_URL
npx wrangler secret put PERSONA_API_KEY    # skip if the backend needs no auth
npx wrangler secret put TURNSTILE_SECRET_KEY # paste Turnstile secret from Cloudflare dashboard
```

Each command prompts for the value and does not echo it.

Two ordering facts:

- **The worker must exist before you can set a secret on it.** `secret put`
  targets a deployed script, so deploy once first. That first deploy will fall
  back to the canned reply for chat, which is fine.
- **Secrets apply immediately, without a redeploy.** The next request picks up
  the new value. No rebuild needed after rotating a key.

Omit `PERSONA_ORIGIN` in production on purpose. `src/worker/routes/chat.ts:41`
defaults the presented origin to the worker's own, which in production *is* the
real site origin — exactly what an upstream allowlist wants. Setting it manually
just creates a second place to forget to update.

To inspect or remove:

```bash
npx wrangler secret list
npx wrangler secret delete PERSONA_API_KEY
```

### The rule that matters

Secrets go in worker secrets or the gitignored `.dev.vars`. **Never** in a
`VITE_*` variable, `.env`, or any file Vite reads — Vite inlines those into the
client bundle, publishing the backend URL and key to every visitor. The design
here is that the browser calls only this site's own `/api/chat` and the worker
proxies upstream server-to-server, which is what keeps the backend unexposed.

## Custom domain

`index.html` hardcodes `https://aryaptrha.fun/` in the canonical link and in the
OG/Twitter `url` and `image` tags. On a `*.workers.dev` URL the site works but
every crawler and link preview points at the custom domain, so attach the domain
before treating a deploy as live.

In the dashboard: **Workers & Pages → aryaptrha-portfolio → Settings → Domains &
Routes → Add → Custom Domain**. Cloudflare provisions the DNS record and
certificate. The zone must already be on your account.

Or declare it in `wrangler.toml`:

```toml
routes = [
  { pattern = "aryaptrha.fun", custom_domain = true }
]
```

If you deploy to a different domain, update the five hardcoded URLs in
`index.html` too.

## SPA routing

Handled in code, not config. `src/worker/index.ts` sends `/api/*` to Hono and
everything else to `env.ASSETS.fetch(request)`. Cloudflare's asset matcher runs
*before* the worker and serves any request that maps to a real file in `dist/`,
so the worker only ever sees the misses — which is where the fallback matters.

This is why `[assets]` in `wrangler.toml` needs `binding = "ASSETS"` and not
just `directory`. Without the binding the site still loads (asset matching
doesn't need it) but any unmatched path throws on an undefined binding. That bug
was live in this repo once; keep the binding.

## Verifying a deploy

```bash
curl https://aryaptrha.fun/api/edge-status
curl https://aryaptrha.fun/api/latency
curl -X POST https://aryaptrha.fun/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"test"}]}'
```

`edge-status` and `latency` need no configuration — they read `request.cf` and
work the moment the worker is up. Real colo/country/TLS values appear here and
not locally, where miniflare fills in placeholders.

For `/api/chat`, a reply of `Halo! Pesan kamu "test" udah masuk...` means the
fallback fired: either `PERSONA_API_URL` is missing or the upstream call failed.

## Logs

```bash
npx wrangler tail
```

Streams live `console.log`/`console.error` from the deployed worker. This is the
only way to distinguish "backend unconfigured" from "backend broken", because
`routes/chat.ts:88-90` catches the upstream error, logs it, and falls through to
the canned reply. From the browser those two cases are identical; in `tail` you
see `Error forwarding to external persona API:` followed by the real cause.

## Rollback

```bash
npx wrangler deployments list
npx wrangler rollback [<deployment-id>]
```

Rollback restores the worker script. Bear in mind the static assets are part of
the deployment, so a rollback reverts the front end too — but secrets are not
versioned and are unaffected.

## Checklist

- [ ] `npx wrangler login` (or `CLOUDFLARE_API_TOKEN` exported)
- [ ] `npm run build` succeeded — type-check included
- [ ] `npm run deploy`
- [ ] `npx wrangler secret put PERSONA_API_URL` (after the first deploy)
- [ ] `npx wrangler secret put PERSONA_API_KEY` if upstream requires auth
- [ ] `npx wrangler secret put TURNSTILE_SECRET_KEY` (Cloudflare Turnstile secret)
- [ ] `PERSONA_ORIGIN` deliberately **not** set
- [ ] Custom domain attached
- [ ] Turnstile widget configured with production domain & `VITE_TURNSTILE_SITE_KEY` set in build env
- [ ] Backend's origin allowlist includes `https://aryaptrha.fun` — see
      [BACKEND-CONTRACT.md](BACKEND-CONTRACT.md)
- [ ] `curl` the three routes above
- [ ] `npx wrangler tail` clean during a live chat
