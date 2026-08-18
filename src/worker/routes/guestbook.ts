import { Hono } from 'hono'
import { readSiteConfig } from '../services/config.service'
import { readGeo } from '../services/edge.service'
import {
  DEFAULT_PAGE_SIZE,
  createEntry,
  listEntries,
  readStats,
  validateInput,
} from '../services/guestbook.service'
import { cacheKey, cached, invalidate } from '../services/kv.service'
import { checkRateLimit, ipBucket, rateLimitHeaders } from '../services/ratelimit.service'
import { buildSessionCookie, resolveSession } from '../services/session.service'
import { verifyTurnstileToken } from '../services/turnstile.service'
import type { GuestbookPage, GuestbookStats } from '../types/data'
import type { AppEnv } from '../types/env'
import { missingBindings, readStorage, storageUnavailableMessage } from '../utils/bindings'
import { error, success } from '../utils/response'

/**
 * The guestbook: the durable half of the site.
 *
 * Both storage products earn their place here rather than appearing for the sake
 * of it. D1 holds the entries, because they must survive and be queryable. KV
 * holds the first page and the stats, because those are read on every page load
 * and change only when somebody posts, and it holds the write counter that keeps
 * one enthusiastic visitor from filling the page.
 */
const guestbook = new Hono<AppEnv>()

/**
 * Five posts per ten minutes per IP bucket.
 *
 * Tuned for a real conversation, not a lockdown: a visitor can post, notice a
 * typo, post again, and reply to themselves without hitting it. Deliberately
 * best-effort — see services/ratelimit.service.ts for why KV cannot make this
 * exact, and which limits are exact instead.
 */
const WRITE_LIMIT = 5
const WRITE_WINDOW_SECONDS = 600

/**
 * Cap on the request body, checked before parsing.
 *
 * The field limits already bound what can be stored, but without this a caller
 * could stream megabytes of JSON that the worker parses and then throws away.
 * 4 KB is comfortably more than a 280-character message plus a name.
 */
const MAX_BODY_BYTES = 4096

/**
 * Only the default first page is cached.
 *
 * It is what nearly every visitor requests and the only page that changes when
 * someone posts. Caching arbitrary cursors would multiply keys by page depth to
 * serve the handful of people who scroll, and each of those keys would need
 * invalidating too.
 */
const FIRST_PAGE_KEY = cacheKey('guestbook', 'page', 'first')
const FIRST_PAGE_TTL_SECONDS = 60

const STATS_KEY = cacheKey('guestbook', 'stats')
const STATS_TTL_SECONDS = 300

/** GET /api/guestbook — newest entries first, keyset-paginated. */
guestbook.get('/guestbook', async (c) => {
  const storage = readStorage(c.env)
  if (!storage) {
    return error(
      storageUnavailableMessage(missingBindings(c.env)),
      'STORAGE_UNAVAILABLE',
      503,
    )
  }

  const requested = Number.parseInt(c.req.query('limit') ?? '', 10)
  const limit = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_PAGE_SIZE
  const cursor = c.req.query('cursor') ?? null

  // Anything other than the plain first page goes straight to D1. `X-Cache:
  // BYPASS` distinguishes "not cacheable" from "cacheable but cold", which
  // matters when reading the network tab to check the cache is working.
  if (cursor || limit !== DEFAULT_PAGE_SIZE) {
    const page = await listEntries(storage.db, { limit, cursor })
    return success<GuestbookPage>({ ...page, cached: false }, 200, { 'X-Cache': 'BYPASS' })
  }

  const outcome = await cached(storage.kv, FIRST_PAGE_KEY, FIRST_PAGE_TTL_SECONDS, () =>
    listEntries(storage.db, { limit, cursor: null }),
  )

  return success<GuestbookPage>({ ...outcome.value, cached: outcome.hit }, 200, {
    'X-Cache': outcome.hit ? 'HIT' : 'MISS',
  })
})

/** GET /api/guestbook/stats — counts, for the header line above the list. */
guestbook.get('/guestbook/stats', async (c) => {
  const storage = readStorage(c.env)
  if (!storage) {
    return error(
      storageUnavailableMessage(missingBindings(c.env)),
      'STORAGE_UNAVAILABLE',
      503,
    )
  }

  const outcome = await cached(storage.kv, STATS_KEY, STATS_TTL_SECONDS, () =>
    readStats(storage.db),
  )

  return success<GuestbookStats>({ ...outcome.value, cached: outcome.hit }, 200, {
    'X-Cache': outcome.hit ? 'HIT' : 'MISS',
  })
})

/** POST /api/guestbook — leave an entry. */
guestbook.post('/guestbook', async (c) => {
  const storage = readStorage(c.env)
  if (!storage) {
    return error(
      storageUnavailableMessage(missingBindings(c.env)),
      'STORAGE_UNAVAILABLE',
      503,
    )
  }

  // The kill switch is checked first, so flipping it in KV stops writes without
  // spending a rate-limit slot or a D1 query on requests that cannot succeed.
  const config = await readSiteConfig(storage.kv)
  if (!config.guestbookEnabled) {
    return error(
      config.guestbookNotice ?? 'Buku tamu sedang ditutup sementara. Balik lagi nanti ya!',
      'GUESTBOOK_DISABLED',
      403,
    )
  }

  const declaredLength = Number.parseInt(c.req.header('content-length') ?? '', 10)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return error(`Pesan terlalu besar (maks ${MAX_BODY_BYTES} byte).`, 'PAYLOAD_TOO_LARGE', 413)
  }

  const verdict = await checkRateLimit(storage.kv, await ipBucket(c.req.raw), {
    limit: WRITE_LIMIT,
    windowSeconds: WRITE_WINDOW_SECONDS,
  })
  const limitHeaders = rateLimitHeaders(verdict)

  if (!verdict.allowed) {
    return error(
      `Wah, santai dulu — coba lagi dalam ${verdict.resetSeconds} detik ya.`,
      'RATE_LIMITED',
      429,
      { ...limitHeaders, 'Retry-After': String(verdict.resetSeconds) },
    )
  }

  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return error('Body must be valid JSON.', 'BAD_REQUEST', 400, limitHeaders)
  }

  // Turnstile bot verification (if secret key is configured on worker environment)
  const turnstileSecret = c.env?.TURNSTILE_SECRET_KEY
  if (turnstileSecret && turnstileSecret.trim()) {
    const rawObj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const turnstileToken =
      typeof rawObj.turnstileToken === 'string'
        ? rawObj.turnstileToken
        : typeof rawObj['cf-turnstile-response'] === 'string'
          ? rawObj['cf-turnstile-response']
          : ''

    const allowedHostnames = c.env?.TURNSTILE_HOSTNAMES
      ? c.env.TURNSTILE_HOSTNAMES.split(',')
          .map((h) => h.trim())
          .filter(Boolean)
      : undefined

    const clientIp =
      c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || undefined

    const verification = await verifyTurnstileToken({
      token: turnstileToken,
      secretKey: turnstileSecret,
      clientIp,
      expectedAction: 'guestbook_post',
      expectedHostnames: allowedHostnames,
    })

    if (!verification.success) {
      return error(
        verification.message ?? 'Verifikasi bot gagal. Silakan coba lagi.',
        'BOT_VERIFICATION_FAILED',
        403,
        limitHeaders,
      )
    }
  }

  const validated = validateInput(raw)
  if (!validated.ok) {
    return error(validated.message, 'VALIDATION_FAILED', 400, limitHeaders)
  }

  const session = resolveSession(c.req.raw)

  try {
    const entry = await createEntry(
      storage.db,
      validated.value,
      readGeo(c.req.raw),
      session.id,
      Date.now(),
    )

    // Awaited rather than deferred: the two deletes go out in parallel and
    // `invalidate` swallows its own failures, so this costs one round trip and
    // cannot fail a write that already succeeded. KV is eventually consistent, so
    // the client prepends the entry returned below instead of refetching — that
    // way the author always sees their own post, cache or no cache.
    await invalidate(storage.kv, [FIRST_PAGE_KEY, STATS_KEY])

    const headers: Record<string, string> = { ...limitHeaders }
    if (session.isNew) {
      headers['Set-Cookie'] = buildSessionCookie(session.id)
    }

    return success(entry, 201, headers)
  } catch (err) {
    // The most likely cause is a CHECK constraint the validator should have
    // caught, so log the real error and keep the visitor-facing message calm.
    console.error('Guestbook insert failed:', err)
    return error('Gagal menyimpan pesan. Coba lagi ya.', 'WRITE_FAILED', 500, limitHeaders)
  }
})

export { guestbook }
