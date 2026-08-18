/**
 * Cloudflare Turnstile token verification service.
 *
 * Calls Cloudflare's canonical siteverify endpoint:
 * https://challenges.cloudflare.com/turnstile/v0/siteverify
 */

export interface VerifyTurnstileOptions {
  token: string
  secretKey: string
  clientIp?: string
  expectedAction?: string
  expectedHostnames?: string[]
}

export interface TurnstileVerifyResult {
  success: boolean
  errorCodes?: string[]
  action?: string
  hostname?: string
  challengeTs?: string
  message?: string
}

/**
 * Validates a Turnstile token against the Cloudflare siteverify endpoint.
 */
export async function verifyTurnstileToken(
  options: VerifyTurnstileOptions,
): Promise<TurnstileVerifyResult> {
  const { token, secretKey, clientIp, expectedAction, expectedHostnames } = options

  if (typeof token !== 'string' || token.trim().length === 0 || token.length > 2048) {
    return { success: false, message: 'Turnstile token tidak valid atau kosong.' }
  }

  if (!secretKey || typeof secretKey !== 'string') {
    return { success: false, message: 'Turnstile secret key belum dikonfigurasi di server.' }
  }

  try {
    const formData = new URLSearchParams()
    formData.append('secret', secretKey.trim())
    formData.append('response', token.trim())
    if (clientIp && clientIp !== 'unknown') {
      formData.append('remoteip', clientIp)
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      return { success: false, message: `Siteverify error HTTP ${response.status}.` }
    }

    const outcome = (await response.json()) as {
      success: boolean
      'error-codes'?: string[]
      action?: string
      hostname?: string
      challenge_ts?: string
    }

    if (!outcome.success) {
      return {
        success: false,
        errorCodes: outcome['error-codes'],
        message: 'Verifikasi bot gagal.',
      }
    }

    // Validate expected action if specified
    if (expectedAction && outcome.action && outcome.action !== expectedAction) {
      return {
        success: false,
        message: `Action mismatch: expected ${expectedAction}, got ${outcome.action}.`,
      }
    }

    // Validate hostname if an allowlist is provided
    if (expectedHostnames && expectedHostnames.length > 0 && outcome.hostname) {
      if (!expectedHostnames.includes(outcome.hostname)) {
        return {
          success: false,
          message: `Hostname mismatch: ${outcome.hostname} tidak diizinkan.`,
        }
      }
    }

    return {
      success: true,
      action: outcome.action,
      hostname: outcome.hostname,
      challengeTs: outcome.challenge_ts,
    }
  } catch (err) {
    console.error('Turnstile verification error:', err)
    return {
      success: false,
      message: 'Gagal menghubungi server verifikasi Turnstile.',
    }
  }
}
