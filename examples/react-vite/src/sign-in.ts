import { authorizeUrl, createPkce, exchangeCode, parseRedirect, refreshToken, revokeToken, withRefresh } from '@plotwork.official/sdk/oauth'
import type { RefreshingToken, Scope, TokenSet } from '@plotwork.official/sdk/oauth'

/**
 * Sign in with Plotwork as a public app: a page with no server, so no client secret. PKCE stands in for the secret: the verifier
 * never leaves this tab, and a code is worth nothing without it.
 *
 * Where the tokens live:
 * - The access token (an hour) is kept in memory only.
 * - The refresh token is kept in `sessionStorage`, so a reload of this tab stays signed in. Any script on the page can read
 *   `sessionStorage`, so a cross-site scripting hole would leak it; it is rotated at every use, and a stolen copy used twice ends
 *   the grant. For less exposure, drop `saveRefresh` and `readRefresh` and the person signs in again after a reload.
 */

export const clientId = import.meta.env.VITE_PLOTWORK_CLIENT_ID ?? ''
/** The API, which is also the authorization server: production unless set. */
export const baseUrl = import.meta.env.VITE_PLOTWORK_BASE_URL || undefined
/** Register exactly this address on the app: `http://localhost:5173/callback` in development. */
export const redirectUri = `${location.origin}/callback`
export const CALLBACK_PATH = '/callback'

const SCOPES: readonly Scope[] = ['profile', 'library:read']
const FLOW_KEY = 'plotwork-example.flow'
const REFRESH_KEY = 'plotwork-example.refresh'

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    // Storage turned off: as good as empty.
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    // Storage turned off: the person signs in again after a reload.
  }
}

const saveRefresh = (tokens: TokenSet): void => write(REFRESH_KEY, tokens.refreshToken)
const readRefresh = (): string | null => read(REFRESH_KEY)

/** The one refresher of this grant. Two would each spend the same refresh token, and the second use ends the grant. */
let current: RefreshingToken | null = null

function hold(tokens: TokenSet): RefreshingToken {
  saveRefresh(tokens)
  current = withRefresh(tokens, { clientId, baseUrl, onRefresh: saveRefresh })
  return current
}

/** Sends the browser to Plotwork to approve the app. */
export async function startSignIn(): Promise<void> {
  const pkce = await createPkce()
  const { url, state } = authorizeUrl({ clientId, redirectUri, scopes: SCOPES, codeChallenge: pkce.challenge, baseUrl })
  write(FLOW_KEY, JSON.stringify({ verifier: pkce.verifier, state }))
  location.assign(url)
}

function parseFlow(saved: string | null): unknown {
  try {
    return saved === null ? null : JSON.parse(saved)
  } catch {
    // Not what this page wrote: no sign-in in progress.
    return null
  }
}

/** Trades the code in the address Plotwork sent the browser back to, with the verifier this tab kept, for tokens. */
async function finishSignIn(address: string): Promise<RefreshingToken> {
  const flow = parseFlow(read(FLOW_KEY))
  write(FLOW_KEY, null)
  if (flow === null || typeof flow !== 'object' || !('state' in flow) || !('verifier' in flow) || typeof flow.state !== 'string' || typeof flow.verifier !== 'string') {
    throw new Error('This tab did not start a sign-in. Press Sign in with Plotwork again.')
  }
  // The state is checked first, so an answer this tab did not ask for is never read.
  const code = parseRedirect(address, flow.state, { baseUrl })
  return hold(await exchangeCode({ clientId, baseUrl, code, redirectUri, codeVerifier: flow.verifier }))
}

/** After a reload: a new access token for the refresh token this tab kept, or null when there is none. */
async function resumeSignIn(): Promise<RefreshingToken | null> {
  const saved = readRefresh()
  if (saved === null) return null
  try {
    return hold(await refreshToken({ clientId, baseUrl, refreshToken: saved }))
  } catch {
    // Revoked, run out, or used elsewhere: signed out.
    write(REFRESH_KEY, null)
    return null
  }
}

let loading: Promise<RefreshingToken | null> | null = null

/**
 * The page's sign-in, worked out once per page load: on the callback address it finishes the sign-in, anywhere else it resumes the
 * one this tab kept. Asked again (React's strict mode runs effects twice in development), it answers the same promise: a code or a
 * refresh token works once, and spending one twice ends the grant.
 */
export function loadSignIn(): Promise<RefreshingToken | null> {
  loading ??= location.pathname === CALLBACK_PATH ? finishSignIn(location.href) : resumeSignIn()
  return loading
}

/** Revokes the refresh token, which ends the grant, and forgets the tokens. */
export async function signOut(): Promise<void> {
  const tokens = current?.current() ?? null
  current = null
  loading = Promise.resolve(null)
  write(REFRESH_KEY, null)
  if (tokens === null) return
  try {
    await revokeToken({ clientId, baseUrl, token: tokens.refreshToken, tokenTypeHint: 'refresh_token' })
  } catch {
    // Forgotten here all the same; the grant ends by itself 30 days after its last use.
  }
}
