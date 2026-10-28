/**
 * A picture's fingerprint: `sha256-` and the SHA-256 of its text in UTF-8, as lower-case hex. The same value an organisation embed
 * link sends as its `ETag` (without the quotes), and what `fingerprint` pins a viewer to. Computed with Web Crypto, so it works in
 * every browser and in Node 20 and later with nothing installed.
 */

/** The prefix every fingerprint starts with, naming the hash. */
export const FINGERPRINT_PREFIX = 'sha256-'

const FINGERPRINT = /^sha256-[0-9a-f]{64}$/

/** True for a value with the shape of a fingerprint. */
export function isFingerprint(value: string): boolean {
  return FINGERPRINT.test(value)
}

/** The fingerprint of a picture's text. */
export async function fingerprintOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  let hex = ''
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0')
  return FINGERPRINT_PREFIX + hex
}
