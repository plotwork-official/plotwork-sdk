/**
 * Sealed cookies: a value encrypted and authenticated with AES-GCM under a key derived from `SESSION_SECRET`, with Web Crypto alone.
 * The browser holds the cookie but can neither read the tokens in it nor change them. The cookie's name is bound into the seal, so a
 * sign-in cookie can never be passed off as a session cookie, and the expiry is inside it, so an old copy stops opening.
 *
 * Server only: it reads `SESSION_SECRET`.
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** A secret shorter than this is refused: 32 random characters, from `openssl rand -base64 32`. */
export const MIN_SECRET_LENGTH = 32

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null
  return new Uint8Array(Buffer.from(text, 'base64url'))
}

const keys = new Map<string, Promise<CryptoKey>>()

/** The AES-GCM key for a secret: HKDF over the secret with a fixed label, made once per secret. */
function keyOf(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret)
  if (key === undefined) {
    key = (async () => {
      const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey'])
      return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode('plotwork-example-session') },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      )
    })()
    keys.set(secret, key)
  }
  return key
}

/** `value` sealed for the cookie named `name`, opening for `maxAgeSeconds`. */
export async function seal(value: unknown, name: string, maxAgeSeconds: number, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = encoder.encode(JSON.stringify({ value, expiresAt: Date.now() + maxAgeSeconds * 1000 }))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(name) }, await keyOf(secret), plain)
  return `${base64Url(iv)}.${base64Url(new Uint8Array(sealed))}`
}

/** The value sealed in a cookie named `name`, or null when it is missing, changed, sealed for another cookie, or past its time. */
export async function unseal(sealed: string | undefined, name: string, secret: string): Promise<unknown> {
  if (sealed === undefined) return null
  const [ivText, bodyText, extra] = sealed.split('.')
  if (ivText === undefined || bodyText === undefined || extra !== undefined) return null
  const iv = fromBase64Url(ivText)
  const body = fromBase64Url(bodyText)
  if (iv === null || body === null || iv.length !== 12) return null
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(name) }, await keyOf(secret), body)
  } catch {
    // Changed, or sealed under another secret: as good as no cookie.
    return null
  }
  const opened: unknown = JSON.parse(decoder.decode(plain))
  if (opened === null || typeof opened !== 'object' || !('expiresAt' in opened) || !('value' in opened)) return null
  if (typeof opened.expiresAt !== 'number' || opened.expiresAt < Date.now()) return null
  return opened.value
}
