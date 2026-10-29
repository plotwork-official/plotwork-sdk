# Python client source

The typed client for the Plotwork API: one transport on `urllib.request`, and the operations generated from `spec/openapi.json`.

## Standards

Code here follows:

- [API clients](../../../.standards/docs/standards/core/api-clients.md) - one transport, typed errors, a timeout, retries only for calls that are safe to send twice
- [Dependencies](../../../.standards/docs/standards/core/dependencies.md) - nothing is imported but the standard library
- [Error handling](../../../.standards/docs/standards/core/error-handling.md) - a diagram's mistakes are data in the answer; only a failed request raises

## Contents

| Path | Purpose |
|---|---|
| `__init__.py` | `Plotwork`, the client: the key or token, the base address, `with_options`, and the generated operations on it. |
| `_request.py` | `Transport`: sends one request with the key or a bearer token asked for before each attempt, reads the answer (JSON, or text with its ETag), retries 429 and 503 for safe calls, and turns the API's error envelope into `PlotworkApiError`. |
| `_library.py` | `Library`: the generated `list`, and `picture` and `picture_url`, written by hand because a picture is SVG text, not JSON. |
| `oauth.py` | `plotwork.oauth`: Sign in with Plotwork. PKCE, the authorize address, the redirect, the token calls, `TokenSet`, `PlotworkOAuthError` and `with_refresh`. |
| `_generated.py` | Every schema as a `TypedDict` and every operation as a typed method, written by `pnpm gen:python`. Never edited by hand; `pnpm check` fails when it is stale. |
| `_version.py` | `__version__`; a test holds it equal to `pyproject.toml`. |
| `py.typed` | Tells type checkers the package carries its own types. |
