# aryaptrha Projects

Personal portfolio landing page with an embedded persona chat widget and live
Cloudflare edge telemetry. Vue 3 SPA served as static assets by a Cloudflare
Worker, which also hosts the `/api/*` routes via Hono.

Live at <https://aryaptrha.fun/>.

## Stack

| Layer    | Choice |
| -------- | ------ |
| Client   | Vue 3 (`<script setup>`, Composition API), TypeScript, Vite |
| Server   | Cloudflare Workers + Hono |
| Styling  | Plain CSS with custom-property design tokens, day + night palettes |
| Hosting  | Cloudflare Workers with static assets |

Requires **Node 22+**.

## Quick start on a fresh clone

```bash
npm install
cp .dev.vars.example .dev.vars   # then fill in — see docs/DEVELOPMENT.md
npm run dev                      # client at http://localhost:5173
npm run cf                       # worker/API at http://localhost:8788 (second terminal)
```

The site, theme toggle, avatar picker and prompt chips all work with `npm run dev`
alone. You only need `npm run cf` for the edge-telemetry widgets and real chat.

Two things that bite on a new machine, both covered in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): `.dev.vars` is gitignored so it does
not come with the clone, and `npm run cf` serves `./dist`, which is stale until
you run `npm run build`.

## Scripts

| Script | Does |
| ------ | ---- |
| `npm run dev` | Vite dev server, HMR, proxies `/api` → `localhost:8788` |
| `npm run cf` | `wrangler dev` — the worker and its API routes, port 8788 |
| `npm run build` | Type-check **and** build in parallel; fails on either |
| `npm run build-only` | Build, skipping the type-check |
| `npm run type-check` | `vue-tsc --build` across all three TS projects |
| `npm run preview` | Serve the built `dist/` without the worker |
| `npm run deploy` | `wrangler deploy` — does **not** build first |

## Layout

```
src/
  App.vue                 Landing grid + floating widgets
  main.ts                 Mount
  assets/base.css         Design tokens, day + night palettes
  components/
    MenuCard.vue          Landing grid tiles
    ThemeToggle.vue       Day/night switch
    CloudflareEdgeStatus.vue, LatencyIndicator.vue, EdgeNetworkVisualization.vue
                          Floating edge-telemetry widgets
    chat/                 Chat widget (container, header, message list + item,
                          input, prompt chips, avatar picker, Arya pixel face)
    icons/                Pixel-art SVG icons
  composables/            useChat, useTheme, useEdgeStatus, useLatency, useVisitLogger
  utils/
    sse.ts                Tolerant SSE reader (pure, no Vue)
    motion.ts             prefers-reduced-motion check for JS-driven loops
    latency.ts            Latency thresholds + status colours (pure, no Vue)
    markdown.ts           Escape-first Markdown subset for chat (pure, no Vue)
  worker/
    index.ts              Entry: /api/* → Hono, everything else → env.ASSETS
    router.ts             Mounts route modules under /api
    routes/               edge.ts (serves /api/edge-status), latency, visitor,
                          chat, config, guestbook, insights
    services/             cf-property extraction
    types/                Env bindings + response shapes
```

TypeScript is split into three projects (`tsconfig.app.json`,
`tsconfig.node.json`, `src/worker/tsconfig.json`) because the client and the
worker have incompatible globals — the app config excludes `src/worker/**`, and
only the worker config pulls in `@cloudflare/workers-types`.

## API routes

| Route | Method | Notes |
| ----- | ------ | ----- |
| `/api/edge-status` | GET | Colo, country, TLS, ray ID from `request.cf` |
| `/api/latency` | GET | Server timestamp; the client computes RTT |
| `/api/chat` | POST | Proxies to the persona backend, or a canned reply |
| `/api/visitor` | GET | Logs one visit; pinged once per load from `App.vue` |
| `/api/config` | GET | Site config consumed by `useSiteConfig` |
| `/api/guestbook` | GET, POST | Entries and submission (Turnstile protected) — D1 |
| `/api/guestbook/stats` | GET | Aggregates for the insights panel — D1 |
| `/api/insights` | GET | Visit + guestbook rollups — D1 |

The `request.cf`-only routes (`edge-status`, `latency`) need zero configuration
and work the moment the worker is deployed; locally their values are miniflare
placeholders or `unknown`. `/api/chat` needs the persona secrets, `/api/guestbook`
is protected with Cloudflare Turnstile bot verification, and the
storage-backed routes need D1 and KV — run `npm run db:migrate` before using
them locally.

## Docs

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — local setup, the two-server
  workflow, env vars, troubleshooting
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Cloudflare setup, secrets, custom
  domain, rollback
- [docs/BACKEND-CONTRACT.md](docs/BACKEND-CONTRACT.md) — what the persona
  backend must implement, including SSE
- [design.md](design.md) — design system: pixel art, glass, pastel, motion budget

## Secrets, in one line

The persona backend URL and key are **worker secrets**, never `VITE_*` vars —
Vite inlines those into the shipped bundle, which would publish them to every
visitor. The browser only ever calls this site's own `/api/chat`.

---

## Roadmap

## Phase 1

Build something.

## Phase 2

Make it work.

## Phase 3

Understand why it works.

## Phase 4

Accidentally optimize it into not working.

## Phase 5

Rewrite everything because a new JavaScript framework released yesterday.

## Phase 6

Repeat forever.
