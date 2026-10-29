/**
 * Who the viewer is when it asks for a picture of a signed-in person's library: a token from Sign in with Plotwork, sent as
 * `Authorization: Bearer`. Never a cookie, never an API key. An embed link (`/o/`) and a stable link (`/l/`) need no token.
 */

/** A token, or a function that gives the current one before each request (so the page can refresh it). */
export type TokenSource = string | (() => string | Promise<string>)

/** A `fetch`-like function: the page's own, to add headers, go through a proxy, or stand in for a test. */
export type Fetcher = (input: string, init: RequestInit) => Promise<Response>

/**
 * True when a token may go to this address: https, or http on this computer (`localhost`, `127.0.0.1`, `[::1]`) for development. A
 * token is never sent over plain http to another host.
 */
export function mayCarryToken(url: URL): boolean {
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
}

/** The `Authorization` header for a token; none for no token or an empty one. A function that throws throws here. */
export async function bearerHeaders(token: TokenSource | null | undefined): Promise<Record<string, string>> {
  if (token === null || token === undefined) return {}
  const value = typeof token === 'string' ? token : await token()
  return value === '' ? {} : { Authorization: `Bearer ${value}` }
}
