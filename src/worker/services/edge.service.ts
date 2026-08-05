import type { EdgeStatusData, LatencyData, VisitorData, CacheData } from '../types/cloudflare'

/**
 * Extracts the cf properties from a request safely.
 */
function getCf(request: Request): IncomingRequestCfProperties | Record<string, never> {
  return (request as unknown as { cf?: IncomingRequestCfProperties }).cf ?? {}
}

/**
 * Builds edge status data from the incoming request.
 */
export function getEdgeStatus(request: Request): EdgeStatusData {
  const cf = getCf(request)

  return {
    status: 'online',
    server: 'Cloudflare',
    colo: ('colo' in cf ? (cf.colo as string) : undefined) ?? 'unknown',
    country: ('country' in cf ? (cf.country as string) : undefined) ?? 'unknown',
    countryCode: ('country' in cf ? (cf.country as string) : undefined) ?? 'unknown',
    city: ('city' in cf ? (cf.city as string) : undefined) ?? 'unknown',
    continent: ('continent' in cf ? (cf.continent as string) : undefined) ?? 'unknown',
    timezone: ('timezone' in cf ? (cf.timezone as string) : undefined) ?? 'unknown',
    protocol: ('httpProtocol' in cf ? (cf.httpProtocol as string) : undefined) ?? 'unknown',
    tlsVersion: ('tlsVersion' in cf ? (cf.tlsVersion as string) : undefined) ?? 'unknown',
    ray: request.headers.get('cf-ray') ?? 'unknown',
    cacheStatus: request.headers.get('cf-cache-status') ?? 'NONE',
    timestamp: new Date().toISOString(),
  }
}

/**
 * Builds latency response data (server timestamp for RTT calculation).
 */
export function getLatency(request: Request): LatencyData {
  const cf = getCf(request)

  return {
    timestamp: new Date().toISOString(),
    server: 'Cloudflare',
    colo: ('colo' in cf ? (cf.colo as string) : undefined) ?? 'unknown',
  }
}

/**
 * Builds visitor information from cf properties.
 */
export function getVisitor(request: Request): VisitorData {
  const cf = getCf(request)
  const language = request.headers.get('accept-language')?.split(',')[0] ?? 'unknown'

  return {
    country: ('country' in cf ? (cf.country as string) : undefined) ?? 'unknown',
    city: ('city' in cf ? (cf.city as string) : undefined) ?? 'unknown',
    continent: ('continent' in cf ? (cf.continent as string) : undefined) ?? 'unknown',
    timezone: ('timezone' in cf ? (cf.timezone as string) : undefined) ?? 'unknown',
    language,
    colo: ('colo' in cf ? (cf.colo as string) : undefined) ?? 'unknown',
  }
}

/**
 * Builds cache status information from headers.
 */
export function getCache(request: Request): CacheData {
  return {
    cacheStatus: request.headers.get('cf-cache-status') ?? 'NONE',
    cacheControl: request.headers.get('cache-control') ?? 'none',
    etag: request.headers.get('etag') ?? 'none',
  }
}

/**
 * The subset of geo that gets written to durable storage.
 *
 * Narrower than `VisitorData` on purpose. That shape is a read-only view for the
 * widget and can grow freely; this one becomes columns in D1, so every field here
 * is a schema commitment. Notably absent: anything that identifies a person. The
 * IP address is never persisted — see services/ratelimit.service.ts, where it is
 * hashed into a KV key that expires with its window.
 */
export interface GeoSnapshot {
  country: string
  city: string
  colo: string
  continent: string
}

/**
 * Reads the persistable geo fields off a request.
 *
 * Falls back to 'unknown' rather than null so the value is always a string: the
 * aggregate queries filter on `<> 'unknown'`, which is simpler than juggling
 * NULL semantics in SQL. Miniflare leaves `cf` sparse locally, so this path is
 * exercised on every local run.
 */
export function readGeo(request: Request): GeoSnapshot {
  const cf = getCf(request)

  return {
    country: ('country' in cf ? (cf.country as string) : undefined) ?? 'unknown',
    city: ('city' in cf ? (cf.city as string) : undefined) ?? 'unknown',
    colo: ('colo' in cf ? (cf.colo as string) : undefined) ?? 'unknown',
    continent: ('continent' in cf ? (cf.continent as string) : undefined) ?? 'unknown',
  }
}
