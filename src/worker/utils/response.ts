import type { ApiSuccess, ApiError } from '../types/cloudflare'

/**
 * Creates a successful JSON response with the standard envelope.
 */
export function success<T>(data: T, status = 200): Response {
  const body: ApiSuccess<T> = { success: true, data }
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

/**
 * Creates an error JSON response with the standard envelope.
 */
export function error(message: string, code: string, status = 500): Response {
  const body: ApiError = {
    success: false,
    error: { message, code },
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
