import { describe, expect, it, vi } from 'vitest'

import { createRequest, OPERATION_PATHS, Plotwork, PlotworkApiError, retryDelay } from '../index.js'
import type { Transport } from '../index.js'

type Call = { url: string; init: RequestInit }

/** A `fetch` that answers from a list, and the calls it saw. */
function fakeFetch(...answers: Response[]) {
  const calls: Call[] = []
  const fetcher = vi.fn(async (url: string | URL | globalThis.Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const answer = answers.shift()
    if (answer === undefined) throw new Error('No answer left')
    return answer
  }) as unknown as typeof fetch
  return { fetcher, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

describe('the Plotwork client', () => {
  it('sends the key, the JSON body, and the path of a typed operation', async () => {
    const { fetcher, calls } = fakeFetch(json({ ok: true, errors: [], warnings: [] }))
    const plotwork = new Plotwork({ apiKey: 'pk_test', fetch: fetcher })
    const answer = await plotwork.diagrams.validate({ source: 'flow "A"\nnode a service "A"\n' })
    expect(answer).toMatchObject({ ok: true })
    expect(calls[0]?.url).toBe('https://api.plotwork.dev/v1/diagrams/validate')
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.headers).toMatchObject({ 'X-API-Key': 'pk_test', 'Content-Type': 'application/json' })
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ source: 'flow "A"\nnode a service "A"\n' })
  })

  it('keeps the path of a base address, as a proxy or an engine under a prefix has', async () => {
    const { fetcher, calls } = fakeFetch(json({ valid: true, errors: [], warnings: [] }), json({ valid: true, errors: [], warnings: [] }))
    await new Plotwork({ baseUrl: 'https://example.com/plotwork', fetch: fetcher }).diagrams.validate({ source: 'flow "A"\n' })
    await new Plotwork({ baseUrl: 'https://example.com/plotwork/', fetch: fetcher }).diagrams.validate({ source: 'flow "A"\n' })
    expect(calls.map((call) => call.url)).toEqual(['https://example.com/plotwork/v1/diagrams/validate', 'https://example.com/plotwork/v1/diagrams/validate'])
  })

  it('puts a GET operation input in the query, and sends nothing to sign in with when there is no key', async () => {
    const { fetcher, calls } = fakeFetch(json({ results: [] }))
    const plotwork = new Plotwork({ baseUrl: 'https://api-preview.plotwork.dev', fetch: fetcher })
    await plotwork.icons.search({ q: 'token exchange', limit: 5 })
    expect(calls[0]?.url).toBe('https://api-preview.plotwork.dev/v1/icons?q=token+exchange&limit=5')
    expect(calls[0]?.init.headers).not.toHaveProperty('X-API-Key')
    expect(calls[0]?.init.headers).not.toHaveProperty('Authorization')
    expect(calls[0]?.init.body).toBeNull()
  })

  it("turns the API's error envelope into a PlotworkApiError with its stable code", async () => {
    const { fetcher } = fakeFetch(json({ error: true, errorCode: 'auth.invalid_key', message: 'The API key is not valid', requestId: 'req_1' }, 401))
    const error = await new Plotwork({ fetch: fetcher }).vocabulary().catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(PlotworkApiError)
    expect(error).toMatchObject({ status: 401, errorCode: 'auth.invalid_key', message: 'The API key is not valid', requestId: 'req_1' })
  })

  it('retries a safe call on 429 after Retry-After, and never retries publishing', async () => {
    const waits: number[] = []
    const transport = (fetcher: typeof fetch): Transport => ({ baseUrl: 'https://api.plotwork.dev', headers: {}, fetch: fetcher, timeoutMs: 1000, maxRetries: 2, sleep: async (ms) => void waits.push(ms) })
    const busy = () => json({ error: true, errorCode: 'rate_limit.exceeded', message: 'Slow down' }, 429, { 'retry-after': '2' })

    const safe = fakeFetch(busy(), json({ ok: true }))
    expect(await createRequest(transport(safe.fetcher))({ method: 'POST', path: '/v1/diagrams/validate', idempotent: true, body: {} })).toEqual({ ok: true })
    expect(waits).toEqual([2000])

    const publish = fakeFetch(busy())
    await expect(createRequest(transport(publish.fetcher))({ method: 'POST', path: '/v1/diagrams/publish', idempotent: false, body: {} })).rejects.toMatchObject({ status: 429 })
    expect(publish.calls).toHaveLength(1)
  })

  it('says when no answer came, without retrying', async () => {
    const fetcher = vi.fn(async () => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch
    await expect(new Plotwork({ fetch: fetcher }).vocabulary()).rejects.toMatchObject({ status: 0, errorCode: 'request.failed' })
  })

  it('waits a doubling half second when the API names no Retry-After, and never more than 30 seconds', () => {
    expect([1, 2, 3].map((attempt) => retryDelay(null, attempt))).toEqual([500, 1000, 2000])
    expect(retryDelay('3600', 1)).toBe(30_000)
  })

  it('sends an access token as a bearer, asking a function for it before every attempt', async () => {
    const { fetcher, calls } = fakeFetch(json({ error: true, errorCode: 'service.busy', message: 'Busy' }, 503, { 'retry-after': '0' }), json({ id: 'u1', name: 'Ada', organisation: null }))
    let issued = 0
    const plotwork = new Plotwork({ accessToken: async () => `pwa_${(issued += 1)}`, fetch: fetcher, maxRetries: 1 })
    const me = await plotwork.me()
    expect(me.name).toBe('Ada')
    expect(calls.map((call) => (call.init.headers as Record<string, string>).Authorization)).toEqual(['Bearer pwa_1', 'Bearer pwa_2'])
    expect(calls[0]?.init.headers).not.toHaveProperty('X-API-Key')
  })

  it('refuses a key and a token together', () => {
    expect(() => new Plotwork({ apiKey: 'pk_test', accessToken: 'pwa_1' })).toThrow(TypeError)
  })

  it('lists the library, and reads a picture as text with its tag, null when it has not changed', async () => {
    const { fetcher, calls } = fakeFetch(
      json({ items: [], nextCursor: null }),
      new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { status: 200, headers: { 'content-type': 'image/svg+xml', etag: '"abc"' } }),
      new Response(null, { status: 304, headers: { etag: '"abc"' } }),
    )
    const plotwork = new Plotwork({ accessToken: 'pwa_1', baseUrl: 'https://api-preview.plotwork.dev', fetch: fetcher })
    await plotwork.library.list({ folder: 'Payments', limit: 10 })
    expect(calls[0]?.url).toBe('https://api-preview.plotwork.dev/v1/library?folder=Payments&limit=10')
    const id = '6f1c2d3e-0000-4000-8000-000000000001'
    expect(plotwork.library.pictureUrl(id)).toBe(`https://api-preview.plotwork.dev/v1/library/${id}.svg`)
    expect(await plotwork.library.picture(id)).toEqual({ svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', etag: '"abc"' })
    expect(calls[1]?.init.headers).toMatchObject({ Accept: 'image/svg+xml', Authorization: 'Bearer pwa_1' })
    expect(await plotwork.library.picture(id, { etag: '"abc"' })).toBeNull()
    expect(calls[2]?.init.headers).toMatchObject({ 'If-None-Match': '"abc"' })
  })

  it('covers every public operation of the spec', () => {
    expect(OPERATION_PATHS).toContain('POST /v1/diagrams/publish')
    expect(OPERATION_PATHS).toContain('GET /v1/icons')
    expect(OPERATION_PATHS).toEqual(expect.arrayContaining(['GET /v1/me', 'GET /v1/library', 'POST /v1/diagrams/embed']))
    // The picture is SVG text, written by hand as library.picture, not a generated JSON call.
    expect(OPERATION_PATHS.some((path) => path.endsWith('.svg'))).toBe(false)
    expect(OPERATION_PATHS.some((path) => path.includes('/boards'))).toBe(false)
  })
})
