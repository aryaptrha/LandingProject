import type { ApiSuccess, ApiError } from '../types/cloudflare'

/**
 * Extra headers a caller can attach to either envelope.
 *
 * Added for the stateful routes, which have things to say that do not belong in
 * the JSON body: `Set-Cookie` for a new session, `RateLimit-*` so a client can
 * back off without guessing, and `X-Cache` to show whether KV or D1 answered.
 * Spread last, so a caller can override `Cache-Control` when a response really is
 * cacheable.
 */
type ExtraHeaders = Record<string, string>

/**
 * Creates a successful JSON response with the standard envelope.
 */
export function success<T>(data: T, status = 200, headers: ExtraHeaders = {}): Response {
  const body: ApiSuccess<T> = { success: true, data }
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}

/**
 * Creates an error JSON response with the standard envelope.
 */
export function error(
  message: string,
  code: string,
  status = 500,
  headers: ExtraHeaders = {},
): Response {
  const body: ApiError = {
    success: false,
    error: { message, code },
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}
