import { Hono } from 'hono'
import { verifyTurnstileToken } from '../services/turnstile.service'
import { createSessionToken } from '../services/token.service'
import { error, success } from '../utils/response'
import { sha256Hex } from '../utils/hash'
import type { AppEnv } from '../types/env'

const session = new Hono<AppEnv>()

interface SessionRequestBody {
  turnstileToken?: string
  'cf-turnstile-response'?: string
}

/**
 * POST /api/session
 *
 * Exchanges a valid Cloudflare Turnstile token for a cryptographically signed
 * session token (X-Session-Token). This session token protects subsequent /api/chat
 * requests against unauthorized bot / script / Postman spam.
 */
session.post('/session', async (c) => {
  try {
    let body: SessionRequestBody
    try {
      body = await c.req.json<SessionRequestBody>()
    } catch {
      return error('Invalid request body. JSON expected.', 'BAD_REQUEST', 400)
    }

    const turnstileToken =
      typeof body?.turnstileToken === 'string' && body.turnstileToken.trim()
        ? body.turnstileToken.trim()
        : typeof body?.['cf-turnstile-response'] === 'string' && body['cf-turnstile-response'].trim()
          ? body['cf-turnstile-response'].trim()
          : ''

    if (!turnstileToken) {
      return error(
        'Turnstile token wajib disertakan untuk mendapatkan session token.',
        'MISSING_TURNSTILE_TOKEN',
        400,
      )
    }

    const turnstileSecret = c.env?.TURNSTILE_SECRET_KEY
    const sessionSecret = c.env?.SESSION_SECRET || turnstileSecret || 'dev-fallback-session-key'

    const clientIp =
      c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || undefined

    // Verify Turnstile token if secret key is present in environment
    if (turnstileSecret && turnstileSecret.trim()) {
      const allowedHostnames = c.env?.TURNSTILE_HOSTNAMES
        ? c.env.TURNSTILE_HOSTNAMES.split(',')
            .map((h) => h.trim())
            .filter(Boolean)
        : undefined

      const verification = await verifyTurnstileToken({
        token: turnstileToken,
        secretKey: turnstileSecret,
        clientIp,
        expectedHostnames: allowedHostnames,
      })

      if (!verification.success) {
        return error(
          verification.message || 'Verifikasi Turnstile gagal. Silakan coba lagi.',
          'BOT_VERIFICATION_FAILED',
          403,
        )
      }
    }

    // Hash client IP if present to optionally bind session token to client
    const ipHash = clientIp && clientIp !== 'unknown' ? await sha256Hex(`ip:${clientIp}`) : undefined

    // Issue signed session token (valid for 24 hours)
    const { token, expiresAt } = await createSessionToken(sessionSecret, {
      ipHash,
      ttlSeconds: 60 * 60 * 24, // 24 hours
    })

    return success({
      sessionToken: token,
      expiresAt,
    })
  } catch (err) {
    console.error('Session token issuance error:', err)
    return error(
      err instanceof Error ? err.message : 'Gagal membuat session token',
      'SERVER_ERROR',
      500,
    )
  }
})

export { session }
