import { afterEach, describe, expect, it, vi } from 'vitest'

import { authorizeUrl, challengeOf, createPkce, exchangeCode, parseRedirect, PlotworkOAuthError, readMetadata, refreshToken, revokeToken, withRefresh } from '../oauth/index.js'
import type { TokenSet } from '../oauth/index.js'

type Call = { url: string; init: RequestInit }

function fakeFetch(...answers: (Response | (() => Response))[]) {
  const calls: Call[] = []
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const answer = answers.shift()
    if (answer === undefined) throw new Error('No answer left')
    return typeof answer === 'function' ? answer() : answer
  }) as unknown as typeof fetch
  return { fetcher, calls }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const tokens = (n: number) => json({ access_token: `pwa_${n}`, refresh_token: `pwr_${n}`, token_type: 'Bearer', expires_in: 3600, scope: 'library:read profile' })
const form = (call: Call | undefined) => Object.fromEntries(new URLSearchParams(String(call?.init.body)))

afterEach(() => {
  vi.useRealTimers()
})

describe('PKCE', () => {
  it('makes a 64 character base64url verifier and its S256 challenge', async () => {
    const pkce = await createPkce()
    expect(pkce.verifier).toMatch(/^[A-Za-z0-9_-]{64}$/)
    expect(pkce.method).toBe('S256')
    expect(pkce.challenge).toBe(await challengeOf(pkce.verifier))
    expect((await createPkce()).verifier).not.toBe(pkce.verifier)
  })

  it('computes the challenge of RFC 7636, appendix B', async () => {
    expect(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('authorizeUrl and parseRedirect', () => {
  it('names every parameter of the authorize request, and makes a state when none is given', () => {
    const { url, state } = authorizeUrl({ clientId: 'app_1', redirectUri: 'https://example.com/callback', scopes: ['library:read', 'profile'], codeChallenge: 'abc', baseUrl: 'https://api-preview.plotwork.dev' })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://api-preview.plotwork.dev/oauth/authorize')
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'app_1',
      redirect_uri: 'https://example.com/callback',
      scope: 'library:read profile',
      state,
      code_challenge: 'abc',
      code_challenge_method: 'S256',
    })
    expect(state.length).toBeGreaterThanOrEqual(32)
    expect(authorizeUrl({ clientId: 'a', redirectUri: 'http://localhost/cb', scopes: ['profile'], codeChallenge: 'c', state: 'mine' }).state).toBe('mine')
  })

  it('returns the code of a redirect whose state and issuer match', () => {
    expect(parseRedirect('https://example.com/callback?code=c1&state=s1&iss=https%3A%2F%2Fapi.plotwork.dev', 's1')).toBe('c1')
    expect(parseRedirect(new URL('https://example.com/cb?code=c2&state=s2'), 's2')).toBe('c2')
  })

  it('checks the state before reading an error, so a forged refusal is not believed', () => {
    expect(() => parseRedirect('https://example.com/cb?error=access_denied&state=other', 's1')).toThrow(expect.objectContaining({ error: 'invalid_state' }))
    expect(() => parseRedirect('https://example.com/cb?code=c', '')).toThrow(expect.objectContaining({ error: 'invalid_state' }))
  })

  it('refuses another issuer, and reports a refusal and a missing code', () => {
    expect(() => parseRedirect('https://example.com/cb?code=c&state=s&iss=https%3A%2F%2Fevil.example', 's')).toThrow(expect.objectContaining({ error: 'invalid_issuer' }))
    expect(parseRedirect('https://example.com/cb?code=c&state=s&iss=https%3A%2F%2Fapi-preview.plotwork.dev', 's', { baseUrl: 'https://api-preview.plotwork.dev/' })).toBe('c')
    const denied = (() => {
      try {
        parseRedirect('https://example.com/cb?error=access_denied&error_description=No&state=s', 's')
      } catch (error) {
        return error
      }
      return null
    })()
    expect(denied).toBeInstanceOf(PlotworkOAuthError)
    expect(denied).toMatchObject({ error: 'access_denied', description: 'No', status: 0 })
    expect(() => parseRedirect('https://example.com/cb?state=s', 's')).toThrow(expect.objectContaining({ error: 'invalid_request' }))
  })
})

describe('the token calls', () => {
  it('trades a code for tokens with a form body, the verifier, and the secret of a confidential app', async () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ['Date'] })
    const { fetcher, calls } = fakeFetch(tokens(1))
    const set = await exchangeCode({ clientId: 'app_1', clientSecret: 'pws_secret', code: 'c1', redirectUri: 'https://example.com/cb', codeVerifier: 'v1', fetch: fetcher })
    expect(set).toEqual({ accessToken: 'pwa_1', refreshToken: 'pwr_1', expiresAt: 1_000_000 + 3_600_000, scope: 'library:read profile', tokenType: 'Bearer' })
    expect(calls[0]?.url).toBe('https://api.plotwork.dev/oauth/token')
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' })
    expect(calls[0]?.init).not.toHaveProperty('credentials')
    expect(form(calls[0])).toEqual({ grant_type: 'authorization_code', code: 'c1', redirect_uri: 'https://example.com/cb', code_verifier: 'v1', client_id: 'app_1', client_secret: 'pws_secret' })
  })

  it('refreshes without a secret for a public app, and reads OAuth errors', async () => {
    const { fetcher, calls } = fakeFetch(tokens(2), json({ error: 'invalid_grant', error_description: 'The refresh token was used before' }, 400))
    expect((await refreshToken({ clientId: 'app_1', refreshToken: 'pwr_1', fetch: fetcher, baseUrl: 'https://api-preview.plotwork.dev/' })).refreshToken).toBe('pwr_2')
    expect(calls[0]?.url).toBe('https://api-preview.plotwork.dev/oauth/token')
    expect(form(calls[0])).toEqual({ grant_type: 'refresh_token', refresh_token: 'pwr_1', client_id: 'app_1' })
    await expect(refreshToken({ clientId: 'app_1', refreshToken: 'pwr_1', fetch: fetcher })).rejects.toMatchObject({ name: 'PlotworkOAuthError', error: 'invalid_grant', description: 'The refresh token was used before', status: 400 })
  })

  it("names the API's own envelope, a page that is not JSON, an answer with no token, and no answer", async () => {
    const { fetcher } = fakeFetch(
      json({ error: true, errorCode: 'oauth.unavailable', message: 'Sign in with Plotwork is not on here' }, 503),
      new Response('<html>Bad gateway</html>', { status: 502 }),
      json({ token_type: 'Bearer' }),
      () => {
        throw new TypeError('offline')
      },
    )
    const options = { clientId: 'a', code: 'c', redirectUri: 'https://e.com/cb', codeVerifier: 'v', fetch: fetcher }
    await expect(exchangeCode(options)).rejects.toMatchObject({ error: 'oauth.unavailable', status: 503 })
    await expect(exchangeCode(options)).rejects.toMatchObject({ error: 'http_502', status: 502 })
    await expect(exchangeCode(options)).rejects.toMatchObject({ error: 'invalid_response' })
    await expect(exchangeCode(options)).rejects.toMatchObject({ error: 'request_failed', status: 0 })
  })

  it('revokes a refresh token with its hint', async () => {
    const { fetcher, calls } = fakeFetch(new Response(null, { status: 200 }))
    await revokeToken({ clientId: 'app_1', token: 'pwr_1', tokenTypeHint: 'refresh_token', fetch: fetcher })
    expect(calls[0]?.url).toBe('https://api.plotwork.dev/oauth/revoke')
    expect(form(calls[0])).toEqual({ token: 'pwr_1', client_id: 'app_1', token_type_hint: 'refresh_token' })
  })

  it('reads the server metadata', async () => {
    const { fetcher, calls } = fakeFetch(json({ issuer: 'https://api.plotwork.dev', authorization_endpoint: 'https://api.plotwork.dev/oauth/authorize', token_endpoint: 'https://api.plotwork.dev/oauth/token' }), json({}, 200))
    expect((await readMetadata({ fetch: fetcher })).issuer).toBe('https://api.plotwork.dev')
    expect(calls[0]?.url).toBe('https://api.plotwork.dev/.well-known/oauth-authorization-server')
    await expect(readMetadata({ fetch: fetcher })).rejects.toMatchObject({ error: 'invalid_response' })
  })
})

describe('withRefresh', () => {
  const first: TokenSet = { accessToken: 'pwa_1', refreshToken: 'pwr_1', expiresAt: 0, scope: 'profile', tokenType: 'Bearer' }

  it('hands back the token it holds until a minute before it ends, then refreshes once for every caller', async () => {
    vi.useFakeTimers({ now: 10_000_000, toFake: ['Date'] })
    let release: () => void = () => undefined
    const gate = new Promise<void>((done) => (release = done))
    const { fetcher, calls } = fakeFetch(tokens(2))
    const saved: TokenSet[] = []
    const token = withRefresh({ ...first, expiresAt: Date.now() + 120_000 }, { clientId: 'app_1', fetch: fetcher, onRefresh: async (set) => void saved.push(set) })
    expect(await token()).toBe('pwa_1')
    expect(calls).toHaveLength(0)

    vi.setSystemTime(Date.now() + 61_000)
    const slow = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      await gate
      return fetcher(url, init)
    }) as unknown as typeof fetch
    const racing = withRefresh(token.current(), { clientId: 'app_1', fetch: slow, onRefresh: async (set) => void saved.push(set) })
    const answers = Promise.all([racing(), racing(), racing()])
    release()
    expect(await answers).toEqual(['pwa_2', 'pwa_2', 'pwa_2'])
    expect(calls).toHaveLength(1)
    expect(form(calls[0])).toMatchObject({ refresh_token: 'pwr_1' })
    expect(saved.map((set) => set.refreshToken)).toEqual(['pwr_2'])
    expect(racing.current().refreshToken).toBe('pwr_2')
  })

  it('tries again on the next call after a refresh fails', async () => {
    const { fetcher, calls } = fakeFetch(new Response('', { status: 503 }), tokens(3))
    const token = withRefresh(first, { clientId: 'app_1', fetch: fetcher, onRefresh: () => undefined })
    await expect(token()).rejects.toMatchObject({ status: 503 })
    expect(await token()).toBe('pwa_3')
    expect(calls).toHaveLength(2)
  })
})
