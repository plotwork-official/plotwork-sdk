<p align="center">
  <a href="https://plotwork.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://plotwork.dev/brand/logo/plotwork-lockup-on-dark.svg">
      <img alt="Plotwork" src="https://plotwork.dev/brand/logo/plotwork-lockup-on-light.svg" width="240">
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

The hosted Plotwork API from TypeScript. Every `/v1` operation (validate, draw, render, import a file, publish, patterns, icons) is a typed call generated from the API's OpenAPI document, sent with `fetch` alone. It runs in Node 20 and later, Deno, Bun, Cloudflare Workers and the browser.

## TL;DR

| Question | Answer |
|---|---|
| What does it install? | Nothing else. |
| Where do the types come from? | The API's OpenAPI document, kept in this repository as [`spec/openapi.json`](https://github.com/plotwork-official/plotwork-sdk/blob/main/spec/openapi.json). |
| How do I sign in? | An API key from the Plotwork portal (`apiKey`), or an OAuth access token (`accessToken`). |
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
| `apiKey` | none |
| `accessToken` | none |
| `baseUrl` | `https://api.plotwork.dev` (`https://api-preview.plotwork.dev` for preview, or a self-hosted engine) |
| `fetch` | the global `fetch` |
| `timeoutMs` | `60000` |
| `maxRetries` | `2` |

Every call also takes `{ signal, timeoutMs }` as its last argument.

## See also

| Page | Why |
|---|---|
| [API reference](https://docs.plotwork.dev) | What each operation does |
| [Viewer](https://www.npmjs.com/package/@plotwork.official/viewer) | Show what you publish, interactively |
| [Vite plugin](https://www.npmjs.com/package/@plotwork.official/vite) | Import `.diagram` files in a Vite app |
