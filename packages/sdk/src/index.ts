import { operations } from './generated.js'
import type { Operations } from './generated.js'
import { libraryPictures } from './library.js'
import type { LibraryPictures } from './library.js'
import { createRequest } from './request.js'
import type { AccessTokenSource, Transport } from './request.js'

/**
 * `@plotwork.official/sdk`: the hosted Plotwork API from TypeScript, on `fetch` alone. Every `/v1` operation is a typed call
 * generated from `spec/openapi.json`:
 *
 *   const plotwork = new Plotwork({ apiKey: process.env.PLOTWORK_API_KEY })
 *   const checked = await plotwork.diagrams.validate({ source })
 *   const published = await plotwork.diagrams.publish({ source, alias: 'checkout-flow' })
 *
 * An API key belongs on a server. A browser app signs its person in with Plotwork (`@plotwork.official/sdk/oauth`) and passes
 * `accessToken` instead: the token is the person's own, short-lived, and fine in a browser.
 */

/** The production API. */
export const DEFAULT_BASE_URL = 'https://api.plotwork.dev'

export interface PlotworkOptions {
  /**
   * An account or organisation API key, sent as `X-API-Key`. Keep it on a server, in an environment variable or a secret store:
   * never in a browser.
   */
  apiKey?: string | undefined
  /**
   * A token from Sign in with Plotwork, sent as `Authorization: Bearer`; fine in a browser. A function is called before each
   * request, so it can refresh the token first (`withRefresh` from `@plotwork.official/sdk/oauth` makes one).
   */
  accessToken?: AccessTokenSource | undefined
  /** The API's address: production by default, `https://api-preview.plotwork.dev` for preview, or a self-hosted engine. */
  baseUrl?: string | undefined
  /** The `fetch` to call; the global one when left out. */
  fetch?: typeof fetch | undefined
  /** Milliseconds before a call counts as failed: 60 seconds by default. */
  timeoutMs?: number | undefined
  /** How many times a safe call is tried again on 429 or 503: 2 by default, 0 to never retry. */
  maxRetries?: number | undefined
}

/** `plotwork.library`: the generated `list`, and the pictures, which are SVG text rather than JSON. */
export type Library = Operations['library'] & LibraryPictures

export interface Plotwork extends Omit<Operations, 'library'> {
  library: Library
}

export class Plotwork {
  constructor(options: PlotworkOptions = {}) {
    const headers: Record<string, string> = {}
    const hasKey = options.apiKey !== undefined && options.apiKey !== ''
    if (hasKey && options.accessToken !== undefined) throw new TypeError('Pass apiKey or accessToken to Plotwork, not both')
    if (hasKey) headers['X-API-Key'] = options.apiKey as string
    const transport: Transport = {
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      headers,
      accessToken: options.accessToken,
      fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
      timeoutMs: options.timeoutMs ?? 60_000,
      maxRetries: Math.max(0, options.maxRetries ?? 2),
      sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    }
    const generated = operations(createRequest(transport))
    Object.assign(this, generated, { library: { ...generated.library, ...libraryPictures(transport) } })
  }
}

export { createRequest, createSend, PlotworkApiError, retryDelay, urlOf } from './request.js'
export type { AccessTokenSource, CallOptions, Request, RequestSpec, Transport } from './request.js'
export type { LibraryPicture, LibraryPictureOptions, LibraryPictures } from './library.js'
export * from './generated.js'
