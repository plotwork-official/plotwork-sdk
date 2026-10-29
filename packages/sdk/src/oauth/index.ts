/**
 * `@plotwork.official/sdk/oauth`: Sign in with Plotwork, OAuth 2.1 with PKCE, on `fetch` and Web Crypto alone. It runs in a browser,
 * Node 20 and later, Workers, Deno and Bun.
 *
 *   const pkce = await createPkce()
 *   const { url, state } = authorizeUrl({ clientId, redirectUri, scopes: ['library:read'], codeChallenge: pkce.challenge })
 *   // ... the browser goes to url and comes back to redirectUri
 *   const code = parseRedirect(location.href, state)
 *   const tokens = await exchangeCode({ clientId, code, redirectUri, codeVerifier: pkce.verifier })
 *   const plotwork = new Plotwork({ accessToken: withRefresh(tokens, { clientId, onRefresh: save }) })
 */
export { authorizeUrl, parseRedirect, SCOPES } from './authorize.js'
export type { AuthorizeRequest, AuthorizeUrlOptions, ParseRedirectOptions, Scope } from './authorize.js'
export { DEFAULT_OAUTH_BASE_URL, PlotworkOAuthError } from './errors.js'
export { challengeOf, createPkce } from './pkce.js'
export type { Pkce } from './pkce.js'
export { withRefresh } from './refresh.js'
export type { RefreshingToken, WithRefreshOptions } from './refresh.js'
export { exchangeCode, readMetadata, refreshToken, revokeToken } from './tokens.js'
export type { AuthorizationServerMetadata, ClientOptions, ExchangeCodeOptions, RefreshTokenOptions, RevokeTokenOptions, TokenSet } from './tokens.js'
