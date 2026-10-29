# SDK source

The typed client for the Plotwork API: one request function on `fetch`, and the operations generated from `spec/openapi.json`.

## Standards

Code here follows:

- [API clients](../../../.standards/docs/standards/core/api-clients.md) - one transport, typed errors, a timeout, retries only for calls that are safe to send twice
- [Dependencies](../../../.standards/docs/standards/core/dependencies.md) - nothing is imported but the platform's `fetch`
- [Error handling](../../../.standards/docs/standards/core/error-handling.md) - a diagram's mistakes are data in the answer; only a failed request throws

## Contents

| Path | Purpose |
|---|---|
| `index.ts` | `Plotwork`, the client: the key or token, the base address, and the generated operations on it. |
| `request.ts` | `createSend`: sends one request with the key or a bearer token asked for before each attempt, retries 429 and 503 for safe calls, and turns the API's error envelope into `PlotworkApiError`. `createRequest` reads its JSON. |
| `library.ts` | `library.picture` and `library.pictureUrl`: the SVG of a picture of the library with its ETag, written by hand because it is not JSON. |
| `oauth/` | `@plotwork.official/sdk/oauth`: Sign in with Plotwork. See its README. |
| `generated.ts` | Every schema as a type and every operation as a typed call, written by `pnpm gen:sdk`. Never edited by hand; `pnpm check` fails when it is stale. |
