<p align="center">
  <a href="https://plotwork.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://assets.plotwork.dev/brand/logo/plotwork-lockup-on-dark.svg">
      <img alt="Plotwork" src="https://assets.plotwork.dev/brand/logo/plotwork-lockup-on-light.svg" width="240">
    </picture>
  </a>
</p>

# @plotwork.official/sdk

<p>
  <a href="https://www.npmjs.com/package/@plotwork.official/sdk"><img alt="npm" src="https://img.shields.io/npm/v/%40plotwork.official%2Fsdk?logo=npm&color=0f766e"></a>
  <img alt="Provenance" src="https://img.shields.io/badge/provenance-signed-0f766e?logo=sigstore&logoColor=white">
  <img alt="Runtime dependencies" src="https://img.shields.io/badge/runtime%20dependencies-0-0f766e?logo=dependabot&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/types-generated%20from%20OpenAPI-3178c6?logo=typescript&logoColor=white">
</p>

The hosted Plotwork API from TypeScript. Every `/v1` operation (validate, draw, render, import a file, publish, patterns, icons, the library) is a typed call generated from the API's OpenAPI document, sent with `fetch` alone. It runs in Node 20 and later, Deno, Bun, Cloudflare Workers and the browser.

## TL;DR

| Question | Answer |
|---|---|
| What does it install? | Nothing else. |
| Where do the types come from? | The API's OpenAPI document, kept in this repository as [`spec/openapi.json`](https://github.com/plotwork-official/plotwork-sdk/blob/main/spec/openapi.json). |
| How do I sign in? | On a server, an API key from the Plotwork portal (`apiKey`), sent as `X-API-Key`; never put a key in a browser. In an app whose people have Plotwork accounts, [Sign in with Plotwork](#sign-in-with-plotwork) gives each person's own token (`accessToken`), which is fine in a browser. |
| Does a mistake in a diagram throw? | No. It is part of the answer, with a line, a column and a hint. Only a failed request throws, as `PlotworkApiError` with a stable `errorCode`. |
| Does it retry? | A safe call is retried twice on 429 and 503, after the API's `Retry-After`. Publishing is never retried. |

## Install

```bash
npm install @plotwork.official/sdk
```

## Use

```ts
import { Plotwork, PlotworkApiError } from '@plotwork.official/sdk'

const plotwork = new Plotwork({ apiKey: process.env.PLOTWORK_API_KEY })

const source = 'flow "Checkout"\nnode web service "Web tier"\nnode api service "Orders API"\nweb -> api : "places order"\n'

const checked = await plotwork.diagrams.validate({ source })
if (!checked.valid) console.log(checked.errors)

const published = await plotwork.diagrams.publish({ source })
// A diagram an organisation's policy keeps private has no public link.
if ('url' in published) console.log(published.url)
```

Keep the key in an environment variable or your CI's secret store, never in a file you commit.

| Group | Calls |
|---|---|
| `diagrams` | `validate`, `draw`, `render`, `outline`, `read`, `edit`, `compare`, `suggest`, `convertMermaid`, `publish` |
| `importSource` | A diagram from Terraform, OpenAPI, SQL, Kubernetes, Compose and the other formats the API reads |
| `markdown` | `sync`, `plan` |
| `patterns` | `find`, `get`, `draw`, `check` |
| `icons` | `search`, `map` |
| `vocabulary` | The language's statements and limits, for a kind or a topic |
| `library` | `list` (a page of the diagrams the key or token can see), `picture` (one picture's SVG and ETag), `pictureUrl` |
| `me` | Who the key or token acts as |

## Sign in with Plotwork

An app whose people have Plotwork accounts (a developer portal, a product that inserts diagrams, a browser app with no server) signs each person in and calls the API as them, with no API key anywhere. `@plotwork.official/sdk/oauth` is OAuth 2.1 with PKCE on `fetch` and Web Crypto: it runs in a browser, Node 20 and later, Workers, Deno and Bun. Register the app in the portal under Developers, Apps, to get its client id (and a secret for an app with a server).

| Scope | Lets the app |
|---|---|
| `diagrams:use` | Validate, draw, render and import: computation |
| `diagrams:publish` | Publish |
| `library:read` | List and show the diagrams the person can see, private ones included |
| `profile` | Read the account's id and name (`plotwork.me()`) |
| `email` | Read the account's email address too |

**An app with a server** (confidential: the secret and the tokens stay on the server), as Next.js route handlers:

```ts
// lib/plotwork-app.ts
export const clientId = process.env.PLOTWORK_CLIENT_ID ?? ''
export const clientSecret = process.env.PLOTWORK_CLIENT_SECRET
export const redirectUri = 'https://example.com/auth/plotwork/callback'
```

```ts
// app/auth/plotwork/route.ts: send the person to Plotwork.
import { authorizeUrl, createPkce } from '@plotwork.official/sdk/oauth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { clientId, redirectUri } from '@/lib/plotwork-app'

export async function GET() {
  const pkce = await createPkce()
  const { url, state } = authorizeUrl({ clientId, redirectUri, scopes: ['library:read', 'profile'], codeChallenge: pkce.challenge })
  const jar = await cookies()
  jar.set('plotwork_sign_in', JSON.stringify({ state, verifier: pkce.verifier }), { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 })
  redirect(url)
}
```

```ts
// app/auth/plotwork/callback/route.ts: trade the code for tokens.
import { exchangeCode, parseRedirect } from '@plotwork.official/sdk/oauth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { clientId, clientSecret, redirectUri } from '@/lib/plotwork-app'

export async function GET(request: Request) {
  const jar = await cookies()
  const { state, verifier } = JSON.parse(jar.get('plotwork_sign_in')?.value ?? '{}')
  jar.delete('plotwork_sign_in')
  const code = parseRedirect(request.url, state)
  const tokens = await exchangeCode({ clientId, clientSecret, code, redirectUri, codeVerifier: verifier })
  await saveToSession(tokens) // your server-side session store
  redirect('/')
}
```

Then, on the server, for each request:

```ts
import { Plotwork } from '@plotwork.official/sdk'
import { withRefresh } from '@plotwork.official/sdk/oauth'

const plotwork = new Plotwork({
  accessToken: withRefresh(session.tokens, { clientId, clientSecret, onRefresh: (tokens) => saveToSession(tokens) }),
})
const { items } = await plotwork.library.list()
```

**A browser app with no server** (public: no secret, the tokens live in the page's memory):

```ts
import { Plotwork } from '@plotwork.official/sdk'
import { authorizeUrl, createPkce, exchangeCode, parseRedirect, withRefresh } from '@plotwork.official/sdk/oauth'

const clientId = 'your client id'
const redirectUri = `${location.origin}/callback`

export async function signIn(): Promise<void> {
  const pkce = await createPkce()
  const { url, state } = authorizeUrl({ clientId, redirectUri, scopes: ['library:read'], codeChallenge: pkce.challenge })
  sessionStorage.setItem('plotwork-sign-in', JSON.stringify({ state, verifier: pkce.verifier }))
  location.assign(url)
}

// On the page at redirectUri:
export async function finishSignIn(): Promise<Plotwork> {
  const { state, verifier } = JSON.parse(sessionStorage.getItem('plotwork-sign-in') ?? '{}')
  sessionStorage.removeItem('plotwork-sign-in')
  const code = parseRedirect(location.href, state)
  const tokens = await exchangeCode({ clientId, code, redirectUri, codeVerifier: verifier })
  return new Plotwork({ accessToken: withRefresh(tokens, { clientId, onRefresh: () => undefined }) })
}
```

| Helper | What it does |
|---|---|
| `createPkce()` | A 64 character verifier and its S256 challenge. |
| `authorizeUrl({ clientId, redirectUri, scopes, codeChallenge, state?, baseUrl? })` | The address to send the browser to, and its `state` (random when left out). |
| `parseRedirect(url, expectedState, { baseUrl? })` | The code. Throws on a state that is not yours, an `iss` of another server, or `error=` (the person said no). |
| `exchangeCode({ clientId, clientSecret?, code, redirectUri, codeVerifier })` | A `TokenSet`: `accessToken` (an hour), `refreshToken` (30 days), `expiresAt` in milliseconds, `scope`, `tokenType`. |
| `refreshToken({ clientId, clientSecret?, refreshToken })` | A new `TokenSet`. The refresh token is rotated: the old one stops working, and using it again ends the grant. |
| `revokeToken({ clientId, clientSecret?, token })` | Signs out: a refresh token ends the whole grant. |
| `withRefresh(tokens, { clientId, clientSecret?, onRefresh })` | An `accessToken` function for the client: it refreshes a minute before the token ends, once however many calls ask, and gives each new set to `onRefresh` to save. Use one per grant. |
| `readMetadata({ baseUrl? })` | The server's metadata, `/.well-known/oauth-authorization-server`. |

Every refusal is a `PlotworkOAuthError` with OAuth's `error` (`invalid_grant`, `invalid_client`, `access_denied`), its `description`, and the HTTP `status`. Every helper takes `baseUrl` (`https://api-preview.plotwork.dev` for preview) and `fetch`.

For a place that takes no SVG, such as a social network or a slide, `plotwork.library.png(id, { width: 1600, scheme: 'light' })` answers the picture as PNG bytes; a small width makes a thumbnail. `plotwork.library.list({ q: 'checkout' })` searches names and folders.

To show a private picture of the person's library, give the viewer the same token: `<PlotworkDiagram src={plotwork.library.pictureUrl(id)} token={token} />` ([viewer](https://www.npmjs.com/package/@plotwork.official/viewer)).

## Errors

```ts
try {
  await plotwork.diagrams.render({ source })
} catch (error) {
  if (error instanceof PlotworkApiError) console.log(error.status, error.errorCode, error.requestId)
}
```

| `errorCode` | Means |
|---|---|
| `auth.missing`, `auth.invalid_key` | No key, or one the API does not accept |
| `rate_limit.exceeded` | Too many calls; already retried for a safe call |
| `request.timeout`, `request.failed` | No answer came; `status` is 0 |

## Options

| Option | Default |
|---|---|
| `apiKey` | none. On a server only. |
| `accessToken` | none. A token from Sign in with Plotwork, or a function that returns one, asked before each request. |
| `baseUrl` | `https://api.plotwork.dev` (`https://api-preview.plotwork.dev` for preview, or a self-hosted engine) |
| `fetch` | the global `fetch` |
| `timeoutMs` | `60000` |
| `maxRetries` | `2` |

Every call also takes `{ signal, timeoutMs }` as its last argument.

## See also

| Page | Why |
|---|---|
| [API reference](https://docs.plotwork.dev) | What each operation does |
| [Viewer](https://www.npmjs.com/package/@plotwork.official/viewer) | Show what you publish, interactively, and pick from the person's library |
| [OAuth source](https://github.com/plotwork-official/plotwork-sdk/tree/main/packages/sdk/src/oauth) | How the sign-in helpers are built |
| [Vite plugin](https://www.npmjs.com/package/@plotwork.official/vite) | Import `.diagram` files in a Vite app |
