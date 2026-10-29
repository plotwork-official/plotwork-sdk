import { PlotworkOAuthError, endpointOf } from './errors.js'

/**
 * The calls an app makes to the authorization server with `fetch`: trade a code for tokens, refresh them, revoke one, and read the
 * server's metadata. Each sends no cookie and turns a refusal into `PlotworkOAuthError`.
 */

/** The tokens of one grant. Keep `refreshToken` where only the app reads it: each refresh returns a new one, and the old one dies. */
export interface TokenSet {
  /** `pwa_...`, sent as `Authorization: Bearer`; it lasts an hour. */
  accessToken: string
  /** `pwr_...`, for `refreshToken()`; it lasts 30 days from its last use. */
  refreshToken: string
  /** When the access token ends, in milliseconds since the epoch. */
  expiresAt: number
  /** The scopes the person approved, space-separated, as the server wrote them. */
  scope: string
  tokenType: string
}

/** What every call to the server takes. */
export interface ClientOptions {
  clientId: string
  /** A confidential app's secret (`pws_...`), on a server only. A public app (a browser or desktop app) has none. */
  clientSecret?: string | undefined
  /** The API: production by default, `https://api-preview.plotwork.dev` for preview. */
  baseUrl?: string | undefined
  /** The `fetch` to call; the global one when left out. */
  fetch?: typeof fetch | undefined
  /** Milliseconds before the call counts as failed: 30 seconds by default. */
  timeoutMs?: number | undefined
  signal?: AbortSignal | undefined
}

export interface ExchangeCodeOptions extends ClientOptions {
  /** From `parseRedirect`. */
  code: string
  /** The same address the authorize request named. */
  redirectUri: string
  /** The verifier from `createPkce()`. */
  codeVerifier: string
}

export interface RefreshTokenOptions extends ClientOptions {
  refreshToken: string
}

export interface RevokeTokenOptions extends ClientOptions {
  /** An access token, or a refresh token, which ends the whole grant (the app signs out). */
  token: string
  tokenTypeHint?: 'access_token' | 'refresh_token' | undefined
}

/** The server's RFC 8414 metadata, as far as an app needs it. */
export interface AuthorizationServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  revocation_endpoint?: string
  scopes_supported?: string[]
  code_challenge_methods_supported?: string[]
  [key: string]: unknown
}

const DEFAULT_TIMEOUT_MS = 30_000

async function call(options: ClientOptions, path: string, init: { method: 'GET' | 'POST'; form?: Record<string, string> }): Promise<{ status: number; body: unknown }> {
  const fetcher = options.fetch ?? ((input: RequestInfo | URL, request?: RequestInit) => globalThis.fetch(input, request))
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const stop = (): void => timeout.abort()
  options.signal?.addEventListener('abort', stop, { once: true })
  let response: Response
  try {
    response = await fetcher(endpointOf(options.baseUrl, path), {
      method: init.method,
      headers: init.form === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: init.form === undefined ? null : new URLSearchParams(init.form).toString(),
      signal: timeout.signal,
    })
  } catch (error) {
    if (options.signal?.aborted === true) throw error
    const timedOut = timeout.signal.aborted
    throw new PlotworkOAuthError(timedOut ? 'request_timeout' : 'request_failed', timedOut ? 'The Plotwork API did not answer in time' : 'The Plotwork API could not be reached', 0)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', stop)
  }
  const text = await response.text()
  let body: unknown = null
  try {
    body = text === '' ? null : JSON.parse(text)
  } catch {
    // Not JSON (a proxy's page): the status says enough.
  }
  if (!response.ok) throw refusalOf(response.status, body)
  return { status: response.status, body }
}

/** OAuth's error shape, or the API's own envelope (`errorCode`), or the bare status. */
function refusalOf(status: number, body: unknown): PlotworkOAuthError {
  const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const description = typeof record.error_description === 'string' ? record.error_description : typeof record.message === 'string' ? record.message : ''
  if (typeof record.error === 'string') return new PlotworkOAuthError(record.error, description, status)
  if (typeof record.errorCode === 'string') return new PlotworkOAuthError(record.errorCode, description, status)
  return new PlotworkOAuthError(`http_${status}`, `The Plotwork API answered HTTP ${status}`, status)
}

function clientForm(options: ClientOptions): Record<string, string> {
  return options.clientSecret === undefined || options.clientSecret === '' ? { client_id: options.clientId } : { client_id: options.clientId, client_secret: options.clientSecret }
}

/** The token answer as a `TokenSet`; `previousRefresh` stands in when a refresh answer names no new refresh token. */
function tokenSetOf(body: unknown, status: number, previousRefresh?: string): TokenSet {
  const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const refresh = typeof record.refresh_token === 'string' ? record.refresh_token : previousRefresh
  if (typeof record.access_token !== 'string' || refresh === undefined || typeof record.expires_in !== 'number') {
    throw new PlotworkOAuthError('invalid_response', 'The token answer has no access token, refresh token or lifetime', status)
  }
  return {
    accessToken: record.access_token,
    refreshToken: refresh,
    expiresAt: Date.now() + record.expires_in * 1000,
    scope: typeof record.scope === 'string' ? record.scope : '',
    tokenType: typeof record.token_type === 'string' ? record.token_type : 'Bearer',
  }
}

/** Trades the code from the redirect for tokens: `POST /oauth/token` with `grant_type=authorization_code`. */
export async function exchangeCode(options: ExchangeCodeOptions): Promise<TokenSet> {
  const form = { grant_type: 'authorization_code', code: options.code, redirect_uri: options.redirectUri, code_verifier: options.codeVerifier, ...clientForm(options) }
  const { status, body } = await call(options, '/oauth/token', { method: 'POST', form })
  return tokenSetOf(body, status)
}

/**
 * New tokens for a refresh token: `POST /oauth/token` with `grant_type=refresh_token`. Save the answer's `refreshToken` at once: the
 * one sent stops working, and sending it again ends the whole grant.
 */
export async function refreshToken(options: RefreshTokenOptions): Promise<TokenSet> {
  const form = { grant_type: 'refresh_token', refresh_token: options.refreshToken, ...clientForm(options) }
  const { status, body } = await call(options, '/oauth/token', { method: 'POST', form })
  return tokenSetOf(body, status, options.refreshToken)
}

/** Ends a token (RFC 7009): an access token alone, or with a refresh token the whole grant. An unknown token is not an error. */
export async function revokeToken(options: RevokeTokenOptions): Promise<void> {
  const form: Record<string, string> = { token: options.token, ...clientForm(options) }
  if (options.tokenTypeHint !== undefined) form.token_type_hint = options.tokenTypeHint
  await call(options, '/oauth/revoke', { method: 'POST', form })
}

/** The server's metadata, `GET /.well-known/oauth-authorization-server`. */
export async function readMetadata(options: Omit<ClientOptions, 'clientId' | 'clientSecret'> = {}): Promise<AuthorizationServerMetadata> {
  const { status, body } = await call({ ...options, clientId: '' }, '/.well-known/oauth-authorization-server', { method: 'GET' })
  const record = body as Partial<AuthorizationServerMetadata> | null
  if (record === null || typeof record !== 'object' || typeof record.issuer !== 'string' || typeof record.token_endpoint !== 'string') {
    throw new PlotworkOAuthError('invalid_response', 'The metadata names no issuer or token endpoint', status)
  }
  return record as AuthorizationServerMetadata
}
