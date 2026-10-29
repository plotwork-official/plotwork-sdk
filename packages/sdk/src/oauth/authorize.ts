import { DEFAULT_OAUTH_BASE_URL, PlotworkOAuthError, endpointOf } from './errors.js'
import { randomToken } from './pkce.js'

/**
 * The two ends of the browser's trip: the address that sends the person to Plotwork, and reading the address Plotwork sends them
 * back to. Neither makes a request.
 */

/** What an app may ask for. A token holds only the scopes the person approved. */
export const SCOPES = ['diagrams:use', 'diagrams:publish', 'library:read', 'profile', 'email'] as const

export type Scope = (typeof SCOPES)[number]

export interface AuthorizeUrlOptions {
  /** The app's client id, from the portal's Developer apps. */
  clientId: string
  /** One of the app's registered redirect addresses, exactly. */
  redirectUri: string
  scopes: readonly Scope[]
  /** The PKCE challenge from `createPkce()`. */
  codeChallenge: string
  /** A value to find again in the redirect; a random one is made when left out. */
  state?: string | undefined
  /** The API: production by default, `https://api-preview.plotwork.dev` for preview. */
  baseUrl?: string | undefined
}

export interface AuthorizeRequest {
  /** Send the browser here. */
  url: string
  /** Keep it with the verifier, and give it to `parseRedirect`. */
  state: string
}

/** The address of `GET /oauth/authorize` for this app, and the state it carries. */
export function authorizeUrl(options: AuthorizeUrlOptions): AuthorizeRequest {
  if (options.scopes.length === 0) throw new TypeError('authorizeUrl needs at least one scope')
  const state = options.state ?? randomToken(24)
  const url = new URL(endpointOf(options.baseUrl, '/oauth/authorize'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', options.clientId)
  url.searchParams.set('redirect_uri', options.redirectUri)
  url.searchParams.set('scope', options.scopes.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', options.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return { url: url.href, state }
}

export interface ParseRedirectOptions {
  /** The API the request went to; its address is the issuer the redirect's `iss` must name. Production by default. */
  baseUrl?: string | undefined
}

const withoutSlash = (address: string): string => address.replace(/\/+$/, '')

/**
 * The code from the address Plotwork sent the browser back to. It throws `PlotworkOAuthError` when the state is not the one the app
 * sent (`invalid_state`, checked first, so a forged answer is never read), when `iss` names another server (`invalid_issuer`), when
 * the person said no or the request was refused (`access_denied`, `invalid_scope` and the others, from `error=`), and when there
 * is no code.
 */
export function parseRedirect(address: string | URL, expectedState: string, options: ParseRedirectOptions = {}): string {
  const url = new URL(String(address))
  const query = url.searchParams
  if (expectedState === '' || query.get('state') !== expectedState) throw new PlotworkOAuthError('invalid_state', 'The redirect does not carry the state this app sent', 0)
  const issuer = query.get('iss')
  const expected = withoutSlash(options.baseUrl ?? DEFAULT_OAUTH_BASE_URL)
  if (issuer !== null && withoutSlash(issuer) !== expected) throw new PlotworkOAuthError('invalid_issuer', `The redirect came from ${issuer}, not ${expected}`, 0)
  const error = query.get('error')
  if (error !== null) throw new PlotworkOAuthError(error, query.get('error_description') ?? '', 0)
  const code = query.get('code')
  if (code === null || code === '') throw new PlotworkOAuthError('invalid_request', 'The redirect carries no code', 0)
  return code
}
