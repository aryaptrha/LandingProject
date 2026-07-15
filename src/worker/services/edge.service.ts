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
