export const onRequest: PagesFunction = async (context) => {
  const { request } = context
  const cf = (request as any).cf ?? {}

  const data = {
    status: 'online',
    server: 'Cloudflare',
    colo: cf.colo ?? 'unknown',
    country: cf.country ?? 'unknown',
    countryCode: cf.country ?? 'unknown',
    city: cf.city ?? 'unknown',
    continent: cf.continent ?? 'unknown',
    timezone: cf.timezone ?? 'unknown',
    protocol: cf.httpProtocol ?? 'unknown',
    tlsVersion: cf.tlsVersion ?? 'unknown',
    ray: request.headers.get('cf-ray') ?? 'unknown',
    timestamp: new Date().toISOString(),
    cacheStatus: request.headers.get('cf-cache-status') ?? 'NONE',
  }

  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
