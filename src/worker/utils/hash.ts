/**
 * SHA-256 helper over the Workers-native Web Crypto API.
 *
 * Used to turn an IP address into a rate-limit bucket key without ever storing
 * or logging the address itself. Truncating to 128 bits keeps KV keys short;
 * collisions there are harmless, since the only consequence of two visitors
 * sharing a bucket is that they share a rate limit.
 */
export async function sha256Hex(input: string, bytes = 16): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))

  return Array.from(new Uint8Array(digest).slice(0, bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
