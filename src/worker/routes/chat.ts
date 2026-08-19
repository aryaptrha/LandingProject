import { Hono } from 'hono'
import { error } from '../utils/response'
import { verifySessionToken } from '../services/token.service'
import { checkRateLimit, ipBucket, rateLimitHeaders } from '../services/ratelimit.service'
import { readStorage } from '../utils/bindings'
import type { AppEnv } from '../types/env'

const chat = new Hono<AppEnv>()

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequestBody {
  messages: ChatMessage[]
}

/** Rate limit for chat: max 30 messages per 2 minutes per IP */
const CHAT_RATE_LIMIT = 30
const CHAT_WINDOW_SECONDS = 120

/**
 * Normalizes a persona backend base URL into a full chat endpoint.
 * Accepts either `https://host` or `https://host/api/chat`.
 */
function resolvePersonaUrl(raw: string): string {
  const clean = raw.trim().replace(/\/$/, '')
  return clean.endsWith('/api/chat') ? clean : `${clean}/api/chat`
}

chat.post('/chat', async (c) => {
  try {
    // 1. Session Token Validation (Protection against Bots, Postman, & unauthorized hits)
    const turnstileSecret = c.env?.TURNSTILE_SECRET_KEY
    const sessionSecret = c.env?.SESSION_SECRET || turnstileSecret

    if (sessionSecret && sessionSecret.trim()) {
      const sessionToken =
        c.req.header('X-Session-Token') ||
        c.req.header('x-session-token') ||
        ''

      if (!sessionToken.trim()) {
        return error(
          'Akses ditolak: X-Session-Token tidak ditemukan. Silakan selesaikan verifikasi Turnstile terlebih dahulu.',
          'UNAUTHORIZED_SESSION',
          401,
        )
      }

      const verification = await verifySessionToken(sessionToken.trim(), sessionSecret.trim())
      if (!verification.valid) {
        return error(
          verification.error || 'Akses ditolak: Session token tidak valid atau telah kedaluwarsa.',
          'INVALID_SESSION',
          403,
        )
      }
    }

    // 2. Optional Rate Limiting via KV if available
    const storage = readStorage(c.env)
    let limitHeaders: Record<string, string> = {}
    if (storage?.kv) {
      const bucket = await ipBucket(c.req.raw)
      const verdict = await checkRateLimit(storage.kv, `chat:${bucket}`, {
        limit: CHAT_RATE_LIMIT,
        windowSeconds: CHAT_WINDOW_SECONDS,
      })
      limitHeaders = rateLimitHeaders(verdict)

      if (!verdict.allowed) {
        return error(
          `Terlalu banyak permintaan chat. Coba lagi dalam ${verdict.resetSeconds} detik ya.`,
          'RATE_LIMITED',
          429,
          { ...limitHeaders, 'Retry-After': String(verdict.resetSeconds) },
        )
      }
    }

    // 3. Parse and Validate Request Body
    const body = await c.req.json<ChatRequestBody>()

    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return error(
        'Invalid request format. Expected { messages: [{ role, content }] }',
        'BAD_REQUEST',
        400,
        limitHeaders,
      )
    }

    // 4. Forward to the external persona backend when configured as a worker secret.
    const envApiUrl = c.env?.PERSONA_API_URL
    if (envApiUrl && envApiUrl.trim()) {
      const targetUrl = resolvePersonaUrl(envApiUrl)

      // The persona backend enforces an origin allowlist. A server-side fetch sends
      // no Origin header, so present the site's own origin explicitly — otherwise
      // upstream answers "Forbidden: origin not allowed".
      const presentedOrigin = c.env?.PERSONA_ORIGIN?.trim() || new URL(c.req.url).origin

      const upstreamHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Origin: presentedOrigin,
        Referer: `${presentedOrigin}/`,
        // Ask for a stream. Backends that don't support it ignore this and answer
        // with JSON, which the branch below still handles.
        Accept: 'text/event-stream, application/json',
      }

      // Auth to upstream is the worker's job — the key never reaches the browser.
      const upstreamKey = c.env?.PERSONA_API_KEY
      if (upstreamKey && upstreamKey.trim()) {
        upstreamHeaders['Authorization'] = `Bearer ${upstreamKey.trim()}`
      }

      try {
        const extRes = await fetch(targetUrl, {
          method: 'POST',
          headers: upstreamHeaders,
          body: JSON.stringify(body),
        })

        const extContentType = extRes.headers.get('content-type') || ''

        // Stream pass-through: hand the upstream ReadableStream straight to the
        // browser without buffering, so tokens render as they arrive.
        if (extContentType.includes('text/event-stream') && extRes.body) {
          return new Response(extRes.body, {
            status: extRes.status,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-store',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
              ...limitHeaders,
            },
          })
        }

        if (extContentType.includes('application/json')) {
          const extJson = await extRes.json()
          return c.json(extJson as Record<string, unknown>, extRes.status as 200, limitHeaders)
        }
        const extText = await extRes.text()
        return c.json({ success: true, reply: extText }, extRes.status as 200, limitHeaders)
      } catch (proxyErr) {
        console.error('Error forwarding to external persona API:', proxyErr)
      }
    }

    const lastUserMessage = [...body.messages].reverse().find((m) => m.role === 'user')?.content || ''

    // Local fallback response when no external persona endpoint URL is active
    const replyContent = `Halo! Pesan kamu "${lastUserMessage}" udah masuk. Nanti aku (Arya) bakal bales ya!`

    return c.json(
      {
        success: true,
        reply: replyContent,
        messages: [
          ...body.messages,
          {
            role: 'assistant',
            content: replyContent,
          },
        ],
      },
      200,
      limitHeaders,
    )
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Internal Server Error', 'SERVER_ERROR', 500)
  }
})

export { chat }
