/**
 * Client for the worker's JSON envelope.
 *
 * Every `/api/*` route answers with `{ success: true, data }` or
 * `{ success: false, error: { message, code } }`. The existing composables each
 * unwrap that inline, which was fine for one field of geo data. The storage routes
 * changed the calculus: they return real error codes the UI has to branch on —
 * a disabled guestbook reads differently from a rate limit, which reads differently
 * from an unwired binding — and repeating that unwrap three more times would mean
 * three places to get it subtly wrong.
 *
 * The older composables are left as they are. This is for new callers, not a
 * refactor of working code.
 */

/** Error carrying the server's `code`, so callers can branch without string matching. */
export class ApiError extends Error {
  /** Machine-readable code from the envelope, or a synthetic one for transport failures. */
  readonly code: string
  /** HTTP status, or 0 when the request never got a response. */
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

interface Envelope<T> {
  success: boolean
  data?: T
  error?: { message?: string; code?: string }
}

/**
 * Sends a request and unwraps the envelope, throwing `ApiError` on failure.
 *
 * The body is parsed even for non-2xx responses, because that is where the useful
 * message lives — the worker puts a human-readable Indonesian string in
 * `error.message` for exactly this reason. Only if parsing fails do we fall back to
 * the status code.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(path, init)
  } catch (cause) {
    // No response at all: offline, DNS, or a cancelled navigation. Distinguished
    // from a server error by status 0 so the UI can say "check your connection".
    throw new ApiError(
      cause instanceof Error ? cause.message : 'Network request failed',
      'NETWORK_ERROR',
      0,
    )
  }

  let envelope: Envelope<T> | null = null
  try {
    envelope = (await response.json()) as Envelope<T>
  } catch {
    // Left null; handled below. A non-JSON body from an /api route means something
    // upstream of the worker answered, so the status is the only signal we have.
  }

  if (!response.ok || !envelope?.success || envelope.data === undefined) {
    throw new ApiError(
      envelope?.error?.message ?? `HTTP ${response.status}`,
      envelope?.error?.code ?? 'REQUEST_FAILED',
      response.status,
    )
  }

  return envelope.data
}

/** GET a route and return its `data`. */
export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path)
}

/**
 * POST JSON to a route and return its `data`.
 *
 * `credentials: 'same-origin'` is the default for same-origin requests, but stated
 * explicitly because the session cookie the worker sets depends on it and a future
 * reader should not have to know the default to see that.
 */
export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
}
