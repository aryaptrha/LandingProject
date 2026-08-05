# Data layer: D1 and KV

Everything stateful in this project lives in two Cloudflare bindings on the worker.
This document is the setup guide, the schema reference, and the operations manual.

## Contents

- [Where this runs](#where-this-runs)
- [One-time setup](#one-time-setup)
- [Local development](#local-development)
- [What lives where, and why](#what-lives-where-and-why)
- [Schema](#schema)
- [KV keys](#kv-keys)
- [API surface](#api-surface)
- [Operations](#operations)
- [Privacy](#privacy)
- [Known limitations](#known-limitations)

---

## Where this runs

There is no Cloudflare Pages project here, and no separate API host. This is a
single worker that serves the built Vue app through **Workers Static Assets**
(`[assets]` in `wrangler.toml`, bound as `ASSETS`) and handles `/api/*` itself.
Static Assets is the successor to Pages and keeps everything in one deployment,
which is why D1 and KV bind directly to the worker — there is no Pages Functions
split to reason about, and no CORS anywhere.

Concretely: `src/worker/index.ts` routes `/api/*` into Hono and falls back to
`env.ASSETS.fetch(request)` for everything else.

## One-time setup

The repo ships with placeholder binding ids so `wrangler dev` works on a fresh
clone. `wrangler deploy` will fail until you replace them — deliberately, because a
deploy that silently points at nothing is worse than one that stops.

### 1. Create the D1 database

```bash
npx wrangler d1 create aryaptrha-portfolio-db
```

Copy the `database_id` it prints into `wrangler.toml` under `[[d1_databases]]`.

### 2. Create the KV namespace

```bash
npx wrangler kv namespace create CACHE
```

Copy the `id` it prints into `wrangler.toml` under `[[kv_namespaces]]`.

Neither value is a secret. An id names a resource; it grants no access on its own,
which is why both live in the committed `wrangler.toml` rather than in
`wrangler secret`. (Contrast `PERSONA_API_KEY`, which is a secret — see
[DEPLOYMENT.md](./DEPLOYMENT.md).)

### 3. Apply the migrations

Local first, then remote:

```bash
npm run db:migrate          # local .wrangler/state, safe to redo
npm run db:migrate:remote   # the real database
```

`wrangler` tracks which migrations have run in a `d1_migrations` table it manages,
so re-running is a no-op. Check state with `npm run db:list`.

### 4. Verify

```bash
npm run type-check
npm run build
npm run cf                  # wrangler dev on :8788
```

Then:

```bash
curl -s localhost:8788/api/config
curl -s localhost:8788/api/guestbook
curl -s localhost:8788/api/insights
curl -si localhost:8788/api/guestbook \
  -H 'content-type: application/json' \
  -d '{"name":"Arya","message":"Halo dari edge!","avatarId":"ironman"}'
```

The POST should return `201` with the created entry, plus `RateLimit-*` and
`Set-Cookie` headers. Repeat it six times and the sixth should be `429`.

## Local development

`wrangler dev` simulates both bindings against local storage under
`.wrangler/state/` — no network, no cost, no risk to production data. That
directory is gitignored and can be deleted at any time to start from an empty
database.

One thing behaves differently locally, and it is handled rather than worked around:

- **`CF-Connecting-IP` is absent.** Verified: the rate-limit key written by local
  dev is `rl:unknown:<window>`, so every caller collapses into one shared bucket and
  the limit is stricter locally than in production. That is the safe direction to
  fail.

**`request.cf` is populated**, which is worth stating because the opposite is widely
assumed of Miniflare. On wrangler 4.110 a local request arrives with real geo —
country, city, and colo — so the top-countries and top-POP charts fill in locally
instead of sitting empty. `readGeo()` still falls back to the literal `'unknown'`,
because a request genuinely lacking `cf` is possible and the aggregates filter
`<> 'unknown'` to keep those rows out of the charts. Do not rely on local geo being
*your* geo for anything but eyeballing the UI.

The two-server workflow (`npm run dev` for Vite plus `npm run cf` for the worker)
still applies; Vite proxies `/api` to `:8788`.

## What lives where, and why

The split is not arbitrary. The rule: **D1 for anything that must survive and be
queryable, KV for anything read far more often than it changes.**

| Concern | Store | Why |
|---|---|---|
| Guestbook entries | D1 | Must persist, must be ordered and paginated |
| Visit log | D1 | "How many visits in the last 24h, from where" needs rows, not a counter |
| Visitor sessions | D1 | Upserted per visit, counted for unique visitors |
| First page of the guestbook | KV | Read on every page load, changes only on a post |
| Guestbook stats | KV | Same, plus a `GROUP BY` that scans the table |
| Insights aggregate | KV | Five queries including two full-table `GROUP BY`s |
| Rate-limit counters | KV | Short-lived, expiring, never worth a durable row |
| Visit dedupe markers | KV | Expiring by nature — the TTL *is* the logic |
| Site config / kill switch | KV | Tiny, read constantly, written from a phone at 2am |

A primary-key lookup is deliberately **not** cached. Putting KV in front of one
would add a network hop to save nothing.

## Schema

Source of truth: [`migrations/0001_init.sql`](../migrations/0001_init.sql).

All timestamps are **INTEGER epoch milliseconds**, matching `Date.now()`. They are
converted to ISO-8601 strings in the service layer, so `/api/*` responses are
consistent with the rest of the API.

### `guestbook_entries`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `crypto.randomUUID()` |
| `display_name` | TEXT | 1–32 chars, `CHECK`ed |
| `message` | TEXT | 1–280 chars, `CHECK`ed |
| `avatar_id` | TEXT | Allowlisted against `ALLOWED_AVATAR_IDS` |
| `country`, `city`, `colo` | TEXT | From `request.cf`, `'unknown'` when absent |
| `status` | TEXT | `'visible'` or `'hidden'`, `CHECK`ed — this is the moderation lever |
| `session_id` | TEXT | Groups a person's own entries |
| `created_at` | INTEGER | Epoch ms |

Index `idx_guestbook_visible (status, created_at DESC, id DESC)` matches the list
query exactly, including the tiebreaker — so pagination is an index scan, not a
sort.

The length and status constraints are enforced **twice**, in
`guestbook.service.ts` and as `CHECK` constraints. That is intentional: the service
returns a useful message, the database guarantees the invariant even if a future
caller forgets to validate.

### `visitor_sessions`

One row per session cookie, upserted via `ON CONFLICT(id) DO UPDATE`. Holds
`first_seen`, `last_seen`, `visit_count`, and the most recent geo. Geo is refreshed
on each touch rather than frozen, so a visitor who travels shows up where they are
now; the visit log keeps the history.

### `visit_events`

Append-only log, one row per deduped visit. Indexed on `created_at DESC` for the
24-hour window query.

## KV keys

| Key | TTL | Written by | Invalidated by |
|---|---|---|---|
| `v1:guestbook:page:first` | 60s | `GET /api/guestbook` (default page) | `POST /api/guestbook` |
| `v1:guestbook:stats` | 300s | `GET /api/guestbook/stats` | `POST /api/guestbook` |
| `v1:insights:summary` | 300s | `GET /api/insights` | TTL only |
| `rl:<hash>:<window>` | window + margin | `POST /api/guestbook` | expiry only |
| `visit:seen:<sessionId>` | 1800s | `GET /api/visitor` | expiry only |
| `site:config` | n/a (`cacheTtl: 60`) | you, by hand | you, by hand |

Two conventions worth knowing:

- **`v1:` prefix on cached values.** Bump `CACHE_VERSION` in `kv.service.ts` and
  every previously cached value is orphaned at once — the cheap way to ship a shape
  change without hunting keys or writing a purge script. Orphans expire on their own
  TTL.
- **60 seconds is the floor.** KV rejects an `expirationTtl` below 60, so
  `kv.service.ts` clamps up to it. When tuning a TTL, 60s is a hard minimum, not a
  default.

Only cached *values* carry the version prefix. Rate-limit and dedupe keys do not —
they are ephemeral and expire faster than any deploy.

## API surface

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/guestbook` | `?limit=`, `?cursor=`. Only the default first page is cached; anything else answers `X-Cache: BYPASS` |
| `GET` | `/api/guestbook/stats` | Total plus top countries |
| `POST` | `/api/guestbook` | Rate limited, gated by the kill switch, returns `201` with the created entry |
| `GET` | `/api/insights` | Cached aggregate, `403 INSIGHTS_DISABLED` when switched off |
| `GET` | `/api/config` | Feature flags. Always answers, defaults included |
| `GET` | `/api/visitor` | Unchanged response; now also logs the visit in `waitUntil` |

Every response uses the standard envelope (`{ success, data }` /
`{ success, error: { message, code } }`). Codes the front end branches on:

- `STORAGE_UNAVAILABLE` (503) — bindings not wired yet. The UI shows a setup hint
  pointing here, not a red error.
- `GUESTBOOK_DISABLED` (403) — kill switch is on.
- `RATE_LIMITED` (429) — with `Retry-After` and `RateLimit-*`.
- `VALIDATION_FAILED` (400) — message is safe to show to the visitor.

`X-Cache: HIT | MISS | BYPASS` is set on the cacheable GETs, and surfaced in the UI
as a small "KV cache / D1 query" badge. That badge exists so the cache is
observable rather than invisible — watch it flip from `KV cache` to `D1 query` right
after posting.

## Operations

### Close the guestbook without deploying

This is the payoff for keeping config in KV. Spam arrives while you are asleep, you
run one command from your phone, and writes stop — no rebuild, no `wrangler deploy`.

```bash
npx wrangler kv key put --binding=CACHE site:config \
  '{"guestbookEnabled":false,"guestbookNotice":"Sedang dibersihkan, balik lagi nanti ya!"}' \
  --remote
```

Reads stay available while writes are closed. Takes up to 60 seconds to be visible
everywhere, because the worker reads this key with `cacheTtl: 60`. Reopen:

```bash
npx wrangler kv key put --binding=CACHE site:config '{"guestbookEnabled":true}' --remote
```

A missing key means defaults, and every default is *enabled* — a config store that
failed closed would turn a KV blip into an outage of features that work fine
without it.

### Hide a single entry

Moderation is a status flip, not a delete, so it is reversible:

```bash
npx wrangler d1 execute aryaptrha-portfolio-db --remote \
  --command "UPDATE guestbook_entries SET status='hidden' WHERE id='<uuid>'"

npx wrangler kv key delete --binding=CACHE v1:guestbook:page:first --remote
npx wrangler kv key delete --binding=CACHE v1:guestbook:stats --remote
```

The cache deletes are what make it take effect immediately. Skip them and the entry
disappears within 60 seconds anyway, via TTL.

### Inspect the data

```bash
npm run db:console -- "SELECT display_name, message, created_at FROM guestbook_entries ORDER BY created_at DESC LIMIT 10"
npm run db:console -- "SELECT country, COUNT(*) FROM visit_events GROUP BY country ORDER BY 2 DESC"
```

Drop `--local` from the underlying command (or use `wrangler d1 execute … --remote`)
to hit production. Read-only queries only, please — writes bypass every validation
layer described above.

### Reset local data

```bash
rm -rf .wrangler/state && npm run db:migrate
```

## Privacy

Two deliberate choices, both worth preserving:

- **No IP address is stored anywhere.** `CF-Connecting-IP` is hashed with SHA-256
  into a rate-limit bucket that expires with its window, and never written to D1.
  There is no column for it.
- **The session cookie is opaque and unsigned.** It is 122 bits of
  `crypto.randomUUID()`, `HttpOnly`, `Secure`, `SameSite=Lax`. It authorises
  nothing — it groups a person's visits, and forging one buys an attacker a fresh
  empty bucket they could have got by clearing their cookies. Signing it would have
  added a secret to the deployment to protect a value that grants nothing.

Consequence: `uniqueVisitors` is a **lower bound** on people, not a headcount.
Cookie clearers and private windows each look new. For a portfolio that is honest
enough, and the alternative is fingerprinting, which is not on the table.

## Known limitations

Stated rather than hidden, because each one is a trade that was made on purpose.

1. **The rate limiter is best-effort, not a hard ceiling.** KV writes are eventually
   consistent between colos, and read-then-write is not atomic — two simultaneous
   posts can both read `n` and both write `n+1`. It flattens what a guestbook
   actually suffers from (one person posting twenty times) for one KV read and one
   write. A determined attacker with a script and a few IPs gets through. The limits
   that *must* hold — body size, field lengths, the moderation switch — are enforced
   exactly instead, in code and in `CHECK` constraints. If a hard guarantee is ever
   needed, the fix is a Durable Object keyed by bucket; that is a bigger dependency
   than this feature justifies today.

2. **The visit log deduplicates on a 30-minute window.** `/api/visitor` is polled
   every 60 seconds by the front end, so without dedupe the log would gain a row per
   minute per open tab and every aggregate would measure tab-hours. Leave and come
   back later and it counts again; refresh twice and it does not. A lost KV marker
   costs one duplicate row, which the aggregates absorb.

3. **Insights are up to 5 minutes stale.** The panel shows how old the number is
   rather than implying it is live. Polling would return identical responses and
   only make the cache-hit ratio look better than it is.

4. **The guestbook cache covers only the default first page.** Deeper pages query D1
   directly (`X-Cache: BYPASS`). Caching arbitrary cursors would multiply keys by
   page depth to serve the few people who scroll, and each would need invalidating.

5. **`POST /api/guestbook` has no CSRF token.** A cross-origin POST cannot send the
   `SameSite=Lax` session cookie, so the worst it achieves is an anonymous entry —
   which is what the endpoint is for. Rate limiting and moderation cover the spam
   case; a token would add ceremony without closing a hole.

6. **Chat transcripts are not persisted.** Deliberately out of scope: it would
   change the privacy posture of an existing feature, and nobody asked for
   searchable chat history. If it is ever wanted, it needs its own decision about
   retention, not a quiet `INSERT`.

## Related

- [DEPLOYMENT.md](./DEPLOYMENT.md) — deploys, secrets, rollback
- [`migrations/0001_init.sql`](../migrations/0001_init.sql) — schema source of truth
- `src/worker/services/` — every file there opens with why it exists
