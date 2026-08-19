/**
 * HMAC-SHA256 Session Token service using the native Web Crypto API.
 *
 * Generates and validates tamper-proof stateless session tokens for API authentication.
 * Format: <base64url(payload)>.<base64url(signature)>
 */

export interface ChatSessionPayload {
  sid: string
  scope: 'chat'
  iat: number
  exp: number
  ipHash?: string
}

export interface SessionVerificationResult {
  valid: boolean
  payload?: ChatSessionPayload
  error?: string
}

/** 24 hours in seconds for session token validity */
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24

/**
 * Encodes string/Uint8Array to Base64URL without padding
 */
function toBase64Url(buffer: ArrayBuffer | string): string {
  let base64: string
  if (typeof buffer === 'string') {
    base64 = btoa(buffer)
  } else {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      const code = bytes[i] ?? 0
      binary += String.fromCharCode(code)
    }
    base64 = btoa(binary)
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Decodes Base64URL string back to original string
 */
function fromBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) {
    base64 += '='
  }
  return atob(base64)
}

/**
 * Imports an HMAC-SHA256 key from a raw secret string.
 */
async function getCryptoKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  )
}

/**
 * Creates a cryptographically signed session token.
 */
export async function createSessionToken(
  secret: string,
  options?: {
    ttlSeconds?: number
    ipHash?: string
    sessionId?: string
  },
): Promise<{ token: string; expiresAt: number }> {
  const ttl = options?.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS
  const now = Math.floor(Date.now() / 1000)
  const exp = now + ttl

  const payload: ChatSessionPayload = {
    sid: options?.sessionId || crypto.randomUUID(),
    scope: 'chat',
    iat: now,
    exp,
    ipHash: options?.ipHash,
  }

  const enc = new TextEncoder()
  const payloadJson = JSON.stringify(payload)
  const payloadB64 = toBase64Url(payloadJson)

  const key = await getCryptoKey(secret, ['sign'])
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64))
  const signatureB64 = toBase64Url(signatureBuffer)

  return {
    token: `${payloadB64}.${signatureB64}`,
    expiresAt: exp,
  }
}

/**
 * Verifies the signature and expiration of a session token.
 */
export async function verifySessionToken(
  token: string,
  secret: string,
  expectedIpHash?: string,
): Promise<SessionVerificationResult> {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Session token tidak boleh kosong.' }
  }

  const parts = token.split('.')
  if (parts.length !== 2) {
    return { valid: false, error: 'Format session token tidak valid.' }
  }

  const payloadB64 = parts[0]
  const signatureB64 = parts[1]

  if (!payloadB64 || !signatureB64) {
    return { valid: false, error: 'Format session token tidak valid.' }
  }

  try {
    const enc = new TextEncoder()
    const key = await getCryptoKey(secret, ['verify'])

    // Decode signature
    const sigBinary = fromBase64Url(signatureB64)
    const sigBytes = new Uint8Array(sigBinary.length)
    for (let i = 0; i < sigBinary.length; i++) {
      sigBytes[i] = sigBinary.charCodeAt(i)
    }

    const isSigValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      enc.encode(payloadB64),
    )

    if (!isSigValid) {
      return { valid: false, error: 'Signature session token tidak valid (token dipalsukan).' }
    }

    const payloadJson = fromBase64Url(payloadB64)
    const payload = JSON.parse(payloadJson) as ChatSessionPayload

    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && now > payload.exp) {
      return { valid: false, error: 'Session token telah kedaluwarsa. Silakan verifikasi ulang.' }
    }

    if (payload.scope !== 'chat') {
      return { valid: false, error: 'Scope session token tidak cocok.' }
    }

    if (expectedIpHash && payload.ipHash && payload.ipHash !== expectedIpHash) {
      return { valid: false, error: 'Session token tidak cocok dengan IP pemanggil.' }
    }

    return { valid: true, payload }
  } catch (err) {
    return { valid: false, error: 'Gagal memverifikasi session token.' }
  }
}
