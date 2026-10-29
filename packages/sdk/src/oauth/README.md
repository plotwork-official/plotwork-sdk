# OAuth

`@plotwork.official/sdk/oauth`: Sign in with Plotwork for an app, OAuth 2.1 authorization code with PKCE, on `fetch` and Web Crypto alone.

## Standards

Code here follows:

- [Security](../../../../.standards/docs/standards/core/security.md) - S256 only, the state checked before anything else in a redirect, `iss` checked, no cookie sent, a secret only where the caller passes one
- [API clients](../../../../.standards/docs/standards/core/api-clients.md) - a timeout on every call, and a typed error with the server's own code
- [Error handling](../../../../.standards/docs/standards/core/error-handling.md) - every refusal is a `PlotworkOAuthError` with `error`, `description` and `status`

## Contents

| Path | Purpose |
|---|---|
| `pkce.ts` | `createPkce()`: a 64 character verifier from `crypto.getRandomValues` and its S256 challenge from `crypto.subtle`. |
| `authorize.ts` | `authorizeUrl()`, the address that sends the person to Plotwork with a random state, and `parseRedirect()`, the code from the address they come back to. `SCOPES`. |
| `tokens.ts` | `exchangeCode()`, `refreshToken()`, `revokeToken()` and `readMetadata()`: the calls to `/oauth/token`, `/oauth/revoke` and the RFC 8414 metadata, and `TokenSet`. |
| `refresh.ts` | `withRefresh()`: an `accessToken` function for the client that refreshes a minute early, once however many calls ask, and hands each rotated set to the app. |
| `errors.ts` | `PlotworkOAuthError` and the production address. |
| `index.ts` | The subpath's exports. |
