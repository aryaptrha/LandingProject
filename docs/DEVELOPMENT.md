# Development

How to get this running on a machine that has never seen it before, and what to
do when it misbehaves.

## Prerequisites

- **Node 22 or newer** (`package.json` sets `engines.node >= 22`; Vite 8 and
  Wrangler 4 both need it)
- npm (the repo ships `package-lock.json`)
- A Cloudflare account only if you intend to deploy — local dev needs none

## First run on a new device

```bash
git clone <this repo>
cd LandingProject
npm install
cp .dev.vars.example .dev.vars
```

`.dev.vars` is gitignored, so it does **not** come with the clone. That is the
single most common "it worked on my other machine" cause here — the file exists
on the old device and silently doesn't on the new one. `.dev.vars.example` is
the tracked template that records which vars are needed; see
[Environment variables](#environment-variables).

Then verify the toolchain before touching anything:

```bash
npm run type-check
```

## The two-server workflow

This project runs as two processes in development, in two terminals:

```bash
npm run dev    # terminal 1 — Vite, http://localhost:5173
npm run cf     # terminal 2 — wrangler dev, http://localhost:8788
```

`vite.config.ts` proxies every `/api` request from 5173 to 8788, so **you browse
5173**, not 8788. The port pairing is not a coincidence: `wrangler.toml` pins
`[dev] port = 8788` to match the proxy target. Change one and you must change
the other.

| You want to work on | Run |
| ------------------- | --- |
| Layout, styling, components, theme | `npm run dev` alone |
| Anything under `/api/*` — chat, edge status, latency | both |

### `npm run cf` serves stale files

Wrangler serves static assets out of `./dist` (`[assets] directory = "./dist"`),
which Vite does not update in dev. So if you open **8788** directly you get
whatever `dist/` last held — possibly weeks old, possibly nothing at all on a
fresh clone. Two consequences:

- Browse 5173 in development. Always.
- Before testing the deployed shape locally, run `npm run build` first, then
  `npm run cf`, then open 8788.

`dist/` is gitignored, so on a fresh clone it doesn't exist until your first
build.

## Environment variables

All three live in `.dev.vars` locally and as **worker secrets** in production.
None of them is a `VITE_*` var, and none may become one.

| Var | Required | Purpose |
| --- | -------- | ------- |
| `PERSONA_API_URL` | No — falls back to a canned reply | Base URL of the persona backend |
| `PERSONA_ORIGIN` | **Locally, yes** | Origin presented upstream for its allowlist |
| `PERSONA_API_KEY` | Only if the backend requires auth | Bearer token sent upstream |

### Why `PERSONA_ORIGIN` matters more locally than in production

The worker calls the backend server-to-server, and a server-side `fetch` sends
no `Origin` header. `src/worker/routes/chat.ts:41` therefore supplies one,
defaulting to the worker's own origin. In production that default is the real
site origin and is correct. Locally it is `http://127.0.0.1:8788`, which an
origin allowlist will reject with "Forbidden: origin not allowed". Set
`PERSONA_ORIGIN=https://aryaptrha.fun` in `.dev.vars` to borrow the production
origin, and leave the secret unset in production.

### Never `VITE_*`

Vite inlines every `VITE_`-prefixed value into the client bundle at build time.
A `VITE_PERSONA_API_URL` would ship the backend URL — and a `VITE_PERSONA_API_KEY`
the key itself — to every visitor's browser, readable in devtools. The
architecture exists specifically to avoid that: the browser only ever calls this
site's own `/api/chat`, and the worker holds the upstream credentials. Keep it
that way.

### Without a backend configured

Leave `PERSONA_API_URL` unset and `/api/chat` returns a canned Indonesian
acknowledgement (`routes/chat.ts:96`). Useful for working on the chat UI —
bubbles, timestamps, avatars, the slow-response notice — without any backend at
all.

## Scripts

| Script | Does |
| ------ | ---- |
| `npm run dev` | Vite dev server with HMR on 5173 |
| `npm run cf` | `wrangler dev` — worker + API on 8788 |
| `npm run build` | Runs `type-check` and `build-only` in parallel; fails if either does |
| `npm run build-only` | `vite build` with no type-check — for iterating on a build issue |
| `npm run type-check` | `vue-tsc --build`, all three TS projects |
| `npm run preview` | Serves the built `dist/` statically, no worker, no `/api` |
| `npm run deploy` | `wrangler deploy`. Does **not** build — see docs/DEPLOYMENT.md |

## Project structure

```
index.html                Meta tags, OG/Twitter cards, pre-paint theme script
vite.config.ts            Vue plugin, @ alias, /api → :8788 proxy
wrangler.toml             Worker name, assets binding, dev port, secret docs
design.md                 Design-system reference
docs/                     This directory

src/
  App.vue                 Landing grid, floating widgets
  main.ts                 createApp mount
  assets/base.css         Design tokens: day palette on :root, night on [data-theme='night']
  components/
    MenuCard.vue          Landing grid tiles
    ThemeToggle.vue       Day/night switch
    CloudflareEdgeStatus.vue      Colo/country/TLS readout
    LatencyIndicator.vue          RTT readout
    EdgeNetworkVisualization.vue  Animated edge graphic
    chat/                 ChatContainer, ChatHeader, ChatMessageList,
                          ChatMessageItem, ChatInput, ChatPromptChips,
                          ChatAvatarPicker, ChatSettingsModal,
                          AvengerPixelAvatar, DoctorStrangePortalEffect,
                          avengerAvatars.ts (avatar catalogue)
    icons/                Pixel-art SVGs
  composables/
    useChat.ts            Send, stream, persist, retry, timeouts
    useTheme.ts           Day/night toggle, localStorage, theme-color meta
    useEdgeStatus.ts      Polls /api/edge-status
    useLatency.ts         Polls /api/latency, computes RTT
    useVisitor.ts         Polls /api/visitor — currently unused by any component
  utils/
    sse.ts                SSE line reader, framework-free
    motion.ts             prefers-reduced-motion for JS-driven animation
  worker/
    index.ts              /api/* → Hono; otherwise env.ASSETS.fetch()
    router.ts             Mounts route modules under /api + an /api/* 404
    routes/               chat.ts, edge.ts (serves /api/edge-status),
                          latency.ts, visitor.ts, cache.ts
    services/             edge.service.ts — request.cf extraction
    types/env.ts          Env bindings (ASSETS, PERSONA_*), AppEnv
    types/cloudflare.ts   request.cf property shapes
    utils/response.ts     ok() / error() JSON envelope helpers
    tsconfig.json         Worker-only TS project
```

### The three TypeScript projects

The root `tsconfig.json` only holds references. Client and worker code cannot
share one config — the worker needs `@cloudflare/workers-types` globals that
would wrongly widen DOM types in the app, so `tsconfig.app.json` excludes
`src/worker/**/*` and `src/worker/tsconfig.json` covers it separately.
`tsconfig.node.json` handles `vite.config.ts` itself.

Both app and worker set `noUncheckedIndexedAccess: true`, so `arr[i]` is
`T | undefined` — that is why the code is full of `?.` and explicit guards after
indexing. It's deliberate, not noise.

## The chat request path

Worth knowing before debugging anything chat-related:

```
Browser
  └─ POST /api/chat   {messages:[{role,content}]}
       │  (dev: Vite 5173 proxies to 8788)
       ▼
Worker  src/worker/routes/chat.ts
  ├─ PERSONA_API_URL unset  → canned Indonesian reply
  └─ set → fetch(<url>/api/chat) with Origin, Referer,
           Accept: text/event-stream, application/json,
           optional Authorization: Bearer
             ├─ upstream text/event-stream → body streamed straight through
             ├─ upstream application/json  → forwarded as-is
             └─ upstream anything else     → wrapped as {success, reply: <text>}
```

The client parser (`useChat.ts`) is deliberately tolerant and accepts `{reply}`,
`{data:{reply}}`, `{messages:[…]}`, OpenAI-style `choices[0].message.content`,
`{response}`, `{content}` and `{text}`. Adding a backend rarely requires
touching the client.

Client timeouts, for interpreting a hang: a "still thinking" notice at 120 s,
hard request abort at 180 s, stream-idle abort at 45 s without a token.

## Troubleshooting

**Chat always answers in Indonesian with "Pesan kamu … udah masuk"**
That is the fallback. Either `PERSONA_API_URL` is unset, or the upstream fetch
threw. `routes/chat.ts:88-90` logs the error and falls through, so a broken
backend and an unconfigured one look identical from the browser. Check the
`wrangler dev` terminal — the `console.error` lands there. In production use
`npx wrangler tail`.

**Chat requests 404 or the edge widgets show "unknown"**
`npm run cf` isn't running, so the Vite proxy has nothing to reach. Locally the
`request.cf` fields are miniflare placeholders anyway — real colo, country and
TLS values only appear once deployed.

**Opening localhost:8788 shows an old version of the site, or nothing**
Expected. Wrangler serves `dist/`. Browse 5173, or `npm run build` first.

**`env.ASSETS is undefined`**
`wrangler.toml`'s `[assets]` block needs `binding = "ASSETS"` alongside
`directory`. Without it static files still get served (asset matching happens
before the worker runs), but the SPA fallback in `src/worker/index.ts:17` throws
on any path that matches no file.

**Port 8788 already in use**
A stray `wrangler dev` is alive. Kill it — don't pass `--port`, because the Vite
proxy target is hardcoded to 8788.

**Type errors appear only in `npm run build`, never in the editor**
`vue-tsc --build` walks all three projects; your editor may have only loaded
`tsconfig.app.json`. Trust `npm run type-check`.

**A fresh clone won't `npm install`**
Check `node -v` against 22.

## Notes on current state

- `/api/visitor` and `/api/cache` are implemented and reachable, but no
  component calls them — `useVisitor` has no consumer. Not dead code exactly;
  just not wired up.
- `.wrangler/` is local miniflare state (a SQLite cache plus per-run build
  bundles). Ignored, and safe to delete at any time.
