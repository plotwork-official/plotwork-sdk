import { operations } from './generated.js'
import type { Operations } from './generated.js'
import { createRequest } from './request.js'
import type { Transport } from './request.js'

/**
 * `@plotwork.official/sdk`: the hosted Plotwork API from TypeScript, on `fetch` alone. Every `/v1` operation is a typed call
 * generated from `spec/openapi.json`:
 *
 *   const plotwork = new Plotwork({ apiKey: process.env.PLOTWORK_API_KEY })
 *   const checked = await plotwork.diagrams.validate({ source })
 *   const published = await plotwork.diagrams.publish({ source, alias: 'checkout-flow' })
 */

/** The production API. */
export const DEFAULT_BASE_URL = 'https://api.plotwork.dev'

export interface PlotworkOptions {
  /** An account or organisation API key, sent as `X-API-Key`. Keep it in an environment variable or a secret store. */
  apiKey?: string | undefined
  /** An OAuth access token, sent as `Authorization: Bearer`, in place of a key. */
  accessToken?: string | undefined
  /** The API's address: production by default, `https://api-preview.plotwork.dev` for preview, or a self-hosted engine. */
  baseUrl?: string | undefined
  /** The `fetch` to call; the global one when left out. */
  fetch?: typeof fetch | undefined
  /** Milliseconds before a call counts as failed: 60 seconds by default. */
  timeoutMs?: number | undefined
  /** How many times a safe call is tried again on 429 or 503: 2 by default, 0 to never retry. */
  maxRetries?: number | undefined
}

export interface Plotwork extends Operations {}

export class Plotwork {
  constructor(options: PlotworkOptions = {}) {
    const headers: Record<string, string> = {}
    if (options.apiKey !== undefined && options.apiKey !== '') headers['X-API-Key'] = options.apiKey
    if (options.accessToken !== undefined && options.accessToken !== '') headers.Authorization = `Bearer ${options.accessToken}`
    const transport: Transport = {
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      headers,
      fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
      timeoutMs: options.timeoutMs ?? 60_000,
      maxRetries: Math.max(0, options.maxRetries ?? 2),
      sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    }
    Object.assign(this, operations(createRequest(transport)))
  }
}

export { createRequest, PlotworkApiError, retryDelay } from './request.js'
export type { CallOptions, Request, RequestSpec, Transport } from './request.js'
export * from './generated.js'
