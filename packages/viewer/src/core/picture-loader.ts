import type { Fetcher } from './access.js'
import { PICTURE_MAX_BYTES, REQUEST_TIMEOUT_MS } from './limits.js'

/**
 * Fetching a picture's text from its address: a file beside the page, a hosted picture (`cdn.plotwork.dev/d/...`), a stable link
 * (`/l/...`), or an organisation's embed link (`/o/...`). It sends no cookie, asks for an image, and refuses a response past
 * `PICTURE_MAX_BYTES` before reading it whole. A failure is a `PictureLoadError` with a reason the element shows, never a
 * stack trace.
 *
 * A picture of a signed-in person's library (`/v1/library/{id}.svg`) also needs `Authorization: Bearer`, passed in `headers`; the
 * token is the person's own, and it is the only credential ever sent.
 *
 * `revalidate` asks the browser to check its copy with the server before using it (`cache: 'no-cache'`): the browser sends the tag it
 * holds, the server answers 304 when nothing changed, and the browser hands back its copy. That is how a live viewer sees a new
 * version without downloading the picture again every time.
 */

/** Why a picture could not be loaded. */
export type LoadFailure =
  /** The address is not one the viewer fetches: not http, https, or a path relative to the page. */
  | 'address'
  /** The server answered 404 or 403. */
  | 'missing'
  /** The server answered 401: the address needs a token (a picture of the library), or the token was refused or ran out. */
  | 'signed-out'
  /** The answer is not an SVG, or is larger than any picture. */
  | 'not-a-picture'
  /** No answer: offline, refused by the page's content security policy or CORS, or timed out. */
  | 'network'
  /** The picture's fingerprint is not the one the page pinned. */
  | 'fingerprint'

export class PictureLoadError extends Error {
  readonly reason: LoadFailure

  constructor(reason: LoadFailure) {
    super(`The picture could not be loaded (${reason})`)
    this.name = 'PictureLoadError'
    this.reason = reason
  }
}

/** The address resolved against the page, or null when it is not http or https. A `javascript:` or `data:` address is refused. */
export function pictureUrl(src: string, base: string): URL | null {
  let url: URL
  try {
    url = new URL(src, base)
  } catch {
    // Not an address at all: the caller says so.
    return null
  }
  return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
}

/** What a fetch needs besides the address. */
export interface LoadOptions {
  signal?: AbortSignal | undefined
  /** Check the browser's copy with the server first, for a live viewer. */
  revalidate?: boolean | undefined
  /** The `fetch` to call; the global one when left out, so a test or a host can supply its own. */
  fetcher?: Fetcher | undefined
  /** Headers besides `Accept`, such as `Authorization` for a picture of the library. */
  headers?: Readonly<Record<string, string>> | undefined
}

/** The text of the picture at an address. */
export async function loadPicture(url: URL, options: LoadOptions = {}): Promise<string> {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
  const abort = (): void => timeout.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  const fetcher: Fetcher = options.fetcher ?? ((input, init) => fetch(input, init))
  try {
    const response = await fetcher(url.href, {
      credentials: 'omit',
      headers: { ...options.headers, Accept: 'image/svg+xml' },
      cache: options.revalidate === true ? 'no-cache' : 'default',
      signal: timeout.signal,
    })
    if (response.status === 401) throw new PictureLoadError('signed-out')
    if (response.status === 404 || response.status === 403) throw new PictureLoadError('missing')
    if (!response.ok) throw new PictureLoadError('network')
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > PICTURE_MAX_BYTES) throw new PictureLoadError('not-a-picture')
    const text = await response.text()
    if (text.length > PICTURE_MAX_BYTES || !/<svg[\s>]/.test(text)) throw new PictureLoadError('not-a-picture')
    return text
  } catch (error) {
    if (error instanceof PictureLoadError || options.signal?.aborted === true) throw error
    // No answer (offline, refused, or timed out) is one reason to the page, like every other failure here.
    throw new PictureLoadError('network')
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}
