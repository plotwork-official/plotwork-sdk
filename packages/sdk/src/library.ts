import { createSend, PlotworkApiError, urlOf } from './request.js'
import type { CallOptions, Transport } from './request.js'

/**
 * The pictures of the library, written by hand beside the generated `library.list`: `GET /v1/library/{id}.svg` answers an SVG and
 * `GET /v1/library/{id}.png` a PNG, each with a strong ETag, not JSON, so each is the picture and a tag rather than a typed value.
 */

/** One picture of the library, as published. */
export interface LibraryPicture {
  /** The SVG text. */
  svg: string
  /** The strong tag to send back as `etag` next time, or null when the API sent none. */
  etag: string | null
}

export interface LibraryPictureOptions extends CallOptions {
  /** The tag of the copy you hold: the call answers null when the picture has not changed since. */
  etag?: string | undefined
}

/** One picture of the library painted as a PNG. */
export interface LibraryPng {
  /** The PNG bytes. */
  png: Uint8Array
  /** The strong tag to send back as `etag` next time, or null when the API sent none. */
  etag: string | null
}

export interface LibraryPngOptions extends LibraryPictureOptions {
  /** The width in pixels, 64 to 4000; 1600 when left out. A small width makes a thumbnail. */
  width?: number | undefined
  /** For a picture that follows the reader's scheme, the one to paint; a light or dark picture is painted as drawn. */
  scheme?: 'light' | 'dark' | undefined
}

/** The calls on `plotwork.library` that are not generated. */
export interface LibraryPictures {
  /**
   * The address of a picture of the library, `{baseUrl}/v1/library/{id}.svg`. It needs a key or a token with `library:read`, so
   * hand it to the viewer together with its `token` property; an embed or stable link needs neither.
   */
  pictureUrl(id: string): string
  /** The picture's SVG and tag; null when `etag` is given and the picture has not changed. `GET /v1/library/{id}.svg` */
  picture(id: string, options?: LibraryPictureOptions): Promise<LibraryPicture | null>
  /** The address of the picture as a PNG, for places that take no SVG. It needs a key or a token with `library:read`. */
  pngUrl(id: string, options?: Pick<LibraryPngOptions, 'width' | 'scheme'>): string
  /**
   * The picture painted as a PNG, for social networks, slides and other places that take no SVG; null when `etag` is given and it
   * has not changed. `GET /v1/library/{id}.png`
   */
  png(id: string, options?: LibraryPngOptions): Promise<LibraryPng | null>
}

const pathOf = (id: string): string => `/v1/library/${encodeURIComponent(id)}.svg`
const pngPathOf = (id: string): string => `/v1/library/${encodeURIComponent(id)}.png`

export function libraryPictures(transport: Transport): LibraryPictures {
  const send = createSend(transport)
  return {
    pictureUrl: (id) => urlOf(transport, { path: pathOf(id) }),
    async picture(id, options = {}) {
      const { etag, ...call } = options
      const response = await send({ method: 'GET', path: pathOf(id), idempotent: true, accept: 'image/svg+xml', headers: etag === undefined ? {} : { 'If-None-Match': etag } }, call)
      if (response.status === 304) {
        if (etag === undefined) throw new PlotworkApiError(304, 'http.304', 'The Plotwork API answered 304 to a call that sent no tag')
        return null
      }
      return { svg: await response.text(), etag: response.headers.get('etag') }
    },
    pngUrl: (id, options = {}) => urlOf(transport, { path: pngPathOf(id), query: { width: options.width, scheme: options.scheme } }),
    async png(id, options = {}) {
      const { etag, width, scheme, ...call } = options
      const headers = etag === undefined ? {} : { 'If-None-Match': etag }
      const response = await send({ method: 'GET', path: pngPathOf(id), query: { width, scheme }, idempotent: true, accept: 'image/png', headers }, call)
      if (response.status === 304) {
        if (etag === undefined) throw new PlotworkApiError(304, 'http.304', 'The Plotwork API answered 304 to a call that sent no tag')
        return null
      }
      return { png: new Uint8Array(await response.arrayBuffer()), etag: response.headers.get('etag') }
    },
  }
}
