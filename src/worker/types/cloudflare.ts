/**
 * Cloudflare Edge Status response shape.
 */
export interface EdgeStatusData {
  status: string
  server: string
  colo: string
  country: string
  countryCode: string
  city: string
  continent: string
  timezone: string
  protocol: string
  tlsVersion: string
  ray: string
  cacheStatus: string
  timestamp: string
}

/**
 * Latency API response — frontend calculates RTT from the timestamp.
 */
export interface LatencyData {
  timestamp: string
  server: string
  colo: string
}

/**
 * Visitor information derived from Cloudflare's cf object.
 */
export interface VisitorData {
  country: string
  city: string
  continent: string
  timezone: string
  language: string
  colo: string
}

/**
 * Cache status information.
 */
export interface CacheData {
  cacheStatus: string
  cacheControl: string
  etag: string
}

/**
 * Standard API success envelope.
 */
export interface ApiSuccess<T> {
  success: true
  data: T
}

/**
 * Standard API error envelope.
 */
export interface ApiError {
  success: false
  error: {
    message: string
    code: string
  }
}

/**
 * Union type for all API responses.
 */
export type ApiResponse<T> = ApiSuccess<T> | ApiError
