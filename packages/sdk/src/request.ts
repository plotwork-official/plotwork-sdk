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

/** How the client sends requests. */
export interface Transport {
  baseUrl: string
  headers: Readonly<Record<string, string>>
  fetch: typeof fetch
  timeoutMs: number
  maxRetries: number
  /** Waits before a retry; a test passes one that does not wait. */
  sleep: (ms: number) => Promise<void>
}

/** The longest a client waits before one retry, whatever `Retry-After` says. */
const MAX_RETRY_WAIT_MS = 30_000

function urlOf(transport: Transport, spec: RequestSpec): string {
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

/** The `request` the generated operations call, bound to one transport. */
export function createRequest(transport: Transport): Request {
  return async function request<T>(spec: RequestSpec, options: CallOptions = {}): Promise<T> {
    const retries = spec.idempotent ? transport.maxRetries : 0
    for (let attempt = 0; ; attempt += 1) {
      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? transport.timeoutMs)
      const stop = (): void => timeout.abort()
      options.signal?.addEventListener('abort', stop, { once: true })
      let response: Response
      try {
        response = await transport.fetch(urlOf(transport, spec), {
          method: spec.method,
          headers: { Accept: 'application/json', ...(spec.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...transport.headers },
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
      if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T
      if ((response.status === 429 || response.status === 503) && attempt < retries) {
        await response.body?.cancel()
        await transport.sleep(retryDelay(response.headers.get('retry-after'), attempt + 1))
        continue
      }
      throw await errorOf(response)
    }
  }
}
