import { Plotwork, PlotworkApiError } from '@plotwork.official/sdk'
import { PlotworkOAuthError, withRefresh } from '@plotwork.official/sdk/oauth'
import type { Scope, TokenSet } from '@plotwork.official/sdk/oauth'
import type { NextResponse } from 'next/server'

import { MIN_SECRET_LENGTH, seal, unseal } from './session'

/**
 * Sign in with Plotwork as a confidential app: the client secret and the person's tokens stay on this server. The browser holds two
 * sealed, HTTP-only cookies and never a token: one for the few minutes of the sign-in trip (the PKCE verifier and the state), and the
 * session (the token set) after it.
 */

/** What the app asks for: the person's name, their library, and drawing. */
export const SCOPES: readonly Scope[] = ['profile', 'library:read', 'diagrams:use']

/** The sign-in trip's cookie: the PKCE verifier and the state, for ten minutes, sent only to the callback. */
export const FLOW_COOKIE = 'plotwork_example_flow'
const FLOW_PATH = '/auth/plotwork'
const FLOW_SECONDS = 600

/** The session cookie: the token set. It lasts as long as a refresh token can (30 days from its last use). */
export const SESSION_COOKIE = 'plotwork_example_session'
const SESSION_SECONDS = 30 * 24 * 60 * 60

export interface SignInConfig {
  clientId: string
  clientSecret: string
  /** The Plotwork API, which is also the authorization server. */
  baseUrl: string | undefined
  /** This app's address, such as `http://localhost:3000`. */
  appUrl: string
  /** `{appUrl}/auth/plotwork/callback`: register exactly this address on the app. */
  redirectUri: string
  sessionSecret: string
  /** Cookies are `Secure` when the app is served over https. */
  secure: boolean
}

/** The settings from the environment, or null when sign-in is not set up, so the page can say what is missing. */
export function signInConfig(): SignInConfig | null {
  const clientId = process.env.PLOTWORK_CLIENT_ID ?? ''
  const clientSecret = process.env.PLOTWORK_CLIENT_SECRET ?? ''
  const appUrl = (process.env.APP_URL ?? '').replace(/\/+$/, '')
  const sessionSecret = process.env.SESSION_SECRET ?? ''
  if (clientId === '' || clientSecret === '' || appUrl === '' || sessionSecret.length < MIN_SECRET_LENGTH) return null
  let app: URL
  try {
    app = new URL(appUrl)
  } catch {
    return null
  }
  return {
    clientId,
    clientSecret,
    baseUrl: process.env.PLOTWORK_BASE_URL || undefined,
    appUrl: app.origin,
    redirectUri: `${app.origin}/auth/plotwork/callback`,
    sessionSecret,
    secure: app.protocol === 'https:',
  }
}

/** The sign-in trip in progress. */
export interface Flow {
  verifier: string
  state: string
}

/** The cookie readers this file needs: `cookies()` from `next/headers`, or a request's. */
interface CookieReader {
  get(name: string): { value: string } | undefined
}

function isTokenSet(value: unknown): value is TokenSet {
  if (value === null || typeof value !== 'object') return false
  const tokens = value as Record<string, unknown>
  return typeof tokens.accessToken === 'string' && typeof tokens.refreshToken === 'string' && typeof tokens.expiresAt === 'number' && typeof tokens.scope === 'string' && typeof tokens.tokenType === 'string'
}

function isFlow(value: unknown): value is Flow {
  if (value === null || typeof value !== 'object') return false
  const flow = value as Record<string, unknown>
  return typeof flow.verifier === 'string' && typeof flow.state === 'string'
}

export async function readSession(config: SignInConfig, cookies: CookieReader): Promise<TokenSet | null> {
  const value = await unseal(cookies.get(SESSION_COOKIE)?.value, SESSION_COOKIE, config.sessionSecret)
  return isTokenSet(value) ? value : null
}

export async function writeSession(config: SignInConfig, response: NextResponse, tokens: TokenSet): Promise<void> {
  const value = await seal(tokens, SESSION_COOKIE, SESSION_SECONDS, config.sessionSecret)
  response.cookies.set(SESSION_COOKIE, value, { httpOnly: true, sameSite: 'lax', secure: config.secure, path: '/', maxAge: SESSION_SECONDS })
}

export function clearSession(config: SignInConfig, response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: config.secure, path: '/', maxAge: 0 })
}

export async function readFlow(config: SignInConfig, cookies: CookieReader): Promise<Flow | null> {
  const value = await unseal(cookies.get(FLOW_COOKIE)?.value, FLOW_COOKIE, config.sessionSecret)
  return isFlow(value) ? value : null
}

export async function writeFlow(config: SignInConfig, response: NextResponse, flow: Flow): Promise<void> {
  const value = await seal(flow, FLOW_COOKIE, FLOW_SECONDS, config.sessionSecret)
  response.cookies.set(FLOW_COOKIE, value, { httpOnly: true, sameSite: 'lax', secure: config.secure, path: FLOW_PATH, maxAge: FLOW_SECONDS })
}

export function clearFlow(config: SignInConfig, response: NextResponse): void {
  response.cookies.set(FLOW_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: config.secure, path: FLOW_PATH, maxAge: 0 })
}

/** The answer when the session is gone: the grant was revoked, the refresh token ran out, or a copy of it was used twice. */
export function isSignedOut(error: unknown): boolean {
  if (error instanceof PlotworkOAuthError) return error.error === 'invalid_grant'
  return error instanceof PlotworkApiError && error.status === 401
}

/**
 * Runs `work` with a client acting as the signed-in person, then writes the tokens back to the session cookie when `withRefresh`
 * rotated them on the way, whatever `work` answered. A refresh token works once, so a rotated one that is not saved signs the
 * person out at the next refresh.
 */
export async function asPerson(
  config: SignInConfig,
  tokens: TokenSet,
  work: (plotwork: Plotwork) => Promise<NextResponse>,
  onError: (error: unknown) => NextResponse,
): Promise<NextResponse> {
  const accessToken = withRefresh(tokens, {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    baseUrl: config.baseUrl,
    // Saved on the response below, which does not exist yet.
    onRefresh: () => undefined,
  })
  const plotwork = new Plotwork({ accessToken, baseUrl: config.baseUrl })
  let response: NextResponse
  try {
    response = await work(plotwork)
  } catch (error) {
    response = onError(error)
    if (isSignedOut(error)) {
      clearSession(config, response)
      return response
    }
  }
  const now = accessToken.current()
  if (now !== tokens) await writeSession(config, response, now)
  return response
}
