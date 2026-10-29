/**
 * PKCE (RFC 7636) with S256, the only method the Plotwork API takes: a random verifier the app keeps, and its SHA-256 challenge sent
 * with the authorize request. Web Crypto alone, so it runs in a browser, Node 20 and later, Workers and Deno.
 */

/** A verifier and its challenge. Keep `verifier` until the code comes back; send `challenge` to `authorizeUrl`. */
export interface Pkce {
  verifier: string
  challenge: string
  method: 'S256'
}

/** Bytes as base64url with no padding. */
export function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** `count` random bytes as base64url. */
export function randomToken(count: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(count)))
}

/** The S256 challenge of a verifier: base64url(SHA-256(verifier)). */
export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

/** A new verifier of 64 characters (48 random bytes) and its S256 challenge. */
export async function createPkce(): Promise<Pkce> {
  const verifier = randomToken(48)
  return { verifier, challenge: await challengeOf(verifier), method: 'S256' }
}
