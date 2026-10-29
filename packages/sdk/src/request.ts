/**
 * The one function every operation calls: it sends a request to the Plotwork API with `fetch`, and reads the answer. A 2xx answer
 * is the result; a mistake in a diagram is part of that result (`ok: false`, `errors` with line, column and hint), never an
 * exception. Anything else is a `PlotworkApiError` with the API's stable `errorCode`. A call the API may answer again safely is
 * retried on 429 and 503, after the `Retry-After` it gives; publishing is never retried.
 */

/** What a call can be given besides its input. */
export interface CallOptions {
  /** Stops the call. */
  signal?: AbortSignal | undefined
  /** Milliseconds before the call counts as failed, over the client's own. */
  timeoutMs?: number | undefined
}

/** One request, as an operation describes it. */
export interface RequestSpec {
  method: 'GET' | 'POST'
  path: string
  /** What to ask for: JSON by default. */
  accept?: string | undefined
  /** Headers of this request alone, such as `If-None-Match`. */
  headers?: Readonly<Record<string, string>> | undefined
  /** True when sending it twice does nothing more than once: every operation but publishing. */
  idempotent: boolean
  body?: unknown
  query?: Readonly<Record<string, string | number | boolean | undefined>> | undefined
}

export type Request = <T>(spec: RequestSpec, options?: CallOptions) => Promise<T>

/** The API's error envelope (`ErrorResponse`), or what the client knew when there was none. */
export class PlotworkApiError extends Error {
  /** The HTTP status, or 0 when no answer came (offline, refused, timed out). */
  readonly status: number
  /** A stable key such as `auth.invalid_key`, `rate_limit.exceeded` or `request.timeout`. */
  readonly errorCode: string
  readonly details: unknown
  /** The API's trace id, to quote to support. */
  readonly requestId: string | undefined

  constructor(status: number, errorCode: string, message: string, details?: unknown, requestId?: string) {
    super(message)
    this.name = 'PlotworkApiError'
    this.status = status
    this.errorCode = errorCode
    this.details = details
    this.requestId = requestId
  }
}

/** An access token, or a function that gives the current one before each request (so a caller can refresh it). */
export type AccessTokenSource = string | (() => string | Promise<string>)

/** How the client sends requests. */
export interface Transport {
  baseUrl: string
  headers: Readonly<Record<string, string>>
  /** Sent as `Authorization: Bearer`; a function is called before each attempt. */
  accessToken?: AccessTokenSource | undefined
  fetch: typeof fetch
  timeoutMs: number
  maxRetries: number
  /** Waits before a retry; a test passes one that does not wait. */
  sleep: (ms: number) => Promise<void>
}

/** The longest a client waits before one retry, whatever `Retry-After` says. */
const MAX_RETRY_WAIT_MS = 30_000

/** The address of `path` on the client's base address. */
export function urlOf(transport: Pick<Transport, 'baseUrl'>, spec: Pick<RequestSpec, 'path' | 'query'>): string {
  // Relative to the base, so a base with a path (a proxy at /plotwork, an engine under a prefix) keeps it.
  const url = new URL(spec.path.replace(/^\/+/, ''), transport.baseUrl.endsWith('/') ? transport.baseUrl : `${transport.baseUrl}/`)
  for (const [name, value] of Object.entries(spec.query ?? {})) if (value !== undefined) url.searchParams.set(name, String(value))
  return url.href
}

/** How long to wait before retry number `attempt` (from 1): the API's `Retry-After`, else a doubling half second. */
export function retryDelay(retryAfter: string | null, attempt: number): number {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter)
  const wait = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 500 * 2 ** (attempt - 1)
  return Math.min(wait, MAX_RETRY_WAIT_MS)
}

async function errorOf(response: Response): Promise<PlotworkApiError> {
  const requestId = response.headers.get('x-request-id') ?? undefined
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Not JSON (a proxy's page): the status says enough.
  }
  if (body !== null && typeof body === 'object' && 'errorCode' in body && typeof body.errorCode === 'string') {
    const envelope = body as { errorCode: string; message?: unknown; details?: unknown; requestId?: unknown }
    return new PlotworkApiError(response.status, envelope.errorCode, typeof envelope.message === 'string' ? envelope.message : `HTTP ${response.status}`, envelope.details, typeof envelope.requestId === 'string' ? envelope.requestId : requestId)
  }
  return new PlotworkApiError(response.status, `http.${response.status}`, `The Plotwork API answered HTTP ${response.status}`, undefined, requestId)
}

async function bearerOf(token: AccessTokenSource | undefined): Promise<Record<string, string>> {
  if (token === undefined) return {}
  const value = typeof token === 'string' ? token : await token()
  return value === '' ? {} : { Authorization: `Bearer ${value}` }
}

/**
 * Sends one request and returns the answer when it is 2xx or 304, retrying a safe call on 429 and 503. Anything else is a
 * `PlotworkApiError`. The caller reads the body.
 */
export function createSend(transport: Transport): (spec: RequestSpec, options?: CallOptions) => Promise<Response> {
  return async function send(spec: RequestSpec, options: CallOptions = {}): Promise<Response> {
    const retries = spec.idempotent ? transport.maxRetries : 0
    for (let attempt = 0; ; attempt += 1) {
      // Asked again before every attempt, so a function can hand over a refreshed token.
      const bearer = await bearerOf(transport.accessToken)
      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? transport.timeoutMs)
      const stop = (): void => timeout.abort()
      options.signal?.addEventListener('abort', stop, { once: true })
      let response: Response
      try {
        response = await transport.fetch(urlOf(transport, spec), {
          method: spec.method,
          headers: { Accept: spec.accept ?? 'application/json', ...(spec.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...spec.headers, ...transport.headers, ...bearer },
          body: spec.body === undefined ? null : JSON.stringify(spec.body),
          signal: timeout.signal,
        })
      } catch (error) {
        if (options.signal?.aborted === true) throw error
        const timedOut = timeout.signal.aborted
        throw new PlotworkApiError(0, timedOut ? 'request.timeout' : 'request.failed', timedOut ? 'The Plotwork API did not answer in time' : 'The Plotwork API could not be reached')
      } finally {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', stop)
      }
      if (response.ok || response.status === 304) return response
      if ((response.status === 429 || response.status === 503) && attempt < retries) {
        await response.body?.cancel()
        await transport.sleep(retryDelay(response.headers.get('retry-after'), attempt + 1))
        continue
      }
      throw await errorOf(response)
    }
  }
}

/** The `request` the generated operations call, bound to one transport: the answer's JSON. */
export function createRequest(transport: Transport): Request {
  const send = createSend(transport)
  return async function request<T>(spec: RequestSpec, options: CallOptions = {}): Promise<T> {
    const response = await send(spec, options)
    if (response.status === 304) throw new PlotworkApiError(304, 'http.304', 'The Plotwork API answered 304 to a call that sent no tag')
    return (response.status === 204 ? undefined : await response.json()) as T
  }
}
