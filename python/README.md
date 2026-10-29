<p align="center">
  <a href="https://plotwork.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://plotwork.dev/brand/logo/plotwork-lockup-on-dark.svg">
      <img alt="Plotwork" src="https://plotwork.dev/brand/logo/plotwork-lockup-on-light.svg" width="240">
    </picture>
  </a>
</p>

# plotwork

<p>
  <a href="https://pypi.org/project/plotwork/"><img alt="PyPI" src="https://img.shields.io/pypi/v/plotwork?logo=pypi&logoColor=white&color=0f766e"></a>
  <img alt="Python" src="https://img.shields.io/pypi/pyversions/plotwork?logo=python&logoColor=white&color=0f766e">
  <a href="https://pypi.org/project/plotwork/#provenance"><img alt="Provenance" src="https://img.shields.io/badge/provenance-attested-0f766e?logo=sigstore&logoColor=white"></a>
  <img alt="Runtime dependencies" src="https://img.shields.io/badge/runtime%20dependencies-0-0f766e?logo=dependabot&logoColor=white">
  <img alt="Typed" src="https://img.shields.io/badge/types-generated%20from%20OpenAPI-3776ab?logo=python&logoColor=white">
</p>

The hosted Plotwork API from Python. Every `/v1` operation (validate, draw, render, import a file, publish, patterns, icons) is a typed method generated from the API's OpenAPI document, sent with `urllib` from the standard library alone. It runs on Python 3.10 and later.

## TL;DR

| Question | Answer |
|---|---|
| What does it install? | Nothing else. |
| Where do the types come from? | The API's OpenAPI document, kept in the SDK repository as [`spec/openapi.json`](https://github.com/plotwork-official/plotwork-sdk/blob/main/spec/openapi.json). Every request and answer is a `TypedDict`. |
| How do I sign in? | An API key from the Plotwork portal (`api_key`), sent as `X-API-Key`. |
| Does a mistake in a diagram raise? | No. It is part of the answer, with a line, a column and a hint. Only a failed request raises, as `PlotworkApiError` with a stable `error_code`. |
| Does it retry? | A safe call is retried twice on 429 and 503, after the API's `Retry-After`. Publishing is never retried. |
| Is there a TypeScript client? | Yes, [`@plotwork.official/sdk`](https://www.npmjs.com/package/@plotwork.official/sdk), with the same calls in camelCase. |

## Install

```bash
pip install plotwork
```

## Use

```python
import os

from plotwork import Plotwork

plotwork = Plotwork(api_key=os.environ["PLOTWORK_API_KEY"])

source = 'flow "Checkout"\nnode web service "Web tier"\nnode api service "Orders API"\nweb -> api : "places order"\n'

checked = plotwork.diagrams.validate(source=source)
if not checked["valid"]:
    for error in checked["errors"]:
        print(error["line"], error["column"], error["message"], error.get("hint"))

published = plotwork.diagrams.publish(source=source, embedSource=True)
# A diagram an organisation's policy keeps private has no public link.
if "url" in published:
    print(published["url"])
```

A method takes the request's fields as keyword arguments, named as the API names them (`embedSource`, `documentPath`), and returns the answer as a plain `dict` typed by a `TypedDict`. A body you already have as a `dict` is passed with `**body`. Keep the key in an environment variable or your CI's secret store, never in a file you commit.

| Group | Calls |
|---|---|
| `diagrams` | `validate`, `draw`, `render`, `outline`, `read`, `edit`, `compare`, `suggest`, `convert_mermaid`, `publish` |
| `import_source` | A diagram from Terraform, OpenAPI, SQL, Kubernetes, Compose and the other formats the API reads |
| `markdown` | `sync`, `plan` |
| `patterns` | `find`, `get`, `draw`, `check` |
| `icons` | `search`, `map` |
| `vocabulary` | The language's statements and limits, for a kind or a topic |

## Errors

```python
from plotwork import PlotworkApiError

try:
    plotwork.diagrams.render(source=source)
except PlotworkApiError as error:
    print(error.status, error.error_code, error.request_id)
```

| `error_code` | Means |
|---|---|
| `auth.missing`, `auth.invalid_key` | No key, or one the API does not accept |
| `rate_limit.exceeded` | Too many calls; already retried for a safe call |
| `http.<status>` | An answer that was not the API's error envelope, such as a proxy's page |
| `request.timeout`, `request.failed` | No answer came; `status` is 0 |

## Options

| Option | Default |
|---|---|
| `api_key` | none |
| `base_url` | `https://api.plotwork.dev` (`https://api-preview.plotwork.dev` for preview, or a self-hosted engine) |
| `timeout` | `60` seconds |
| `max_retries` | `2` |
| `opener` | `urllib.request.build_opener().open`; pass your own for a proxy or a test |
| `sleep` | `time.sleep`, the wait before a retry |

`plotwork.with_options(timeout=120)` gives a copy with another timeout or number of retries, for a slow call such as a large import.

## See also

| Page | Why |
|---|---|
| [SDKs guide](https://docs.plotwork.dev/sdks) | Every Plotwork SDK, and which to choose |
| [API reference](https://docs.plotwork.dev) | What each operation does |
| [TypeScript client](https://www.npmjs.com/package/@plotwork.official/sdk) | The same API from TypeScript |
| [Viewer](https://www.npmjs.com/package/@plotwork.official/viewer) | Show what you publish, interactively, in a web page |
| [Source](https://github.com/plotwork-official/plotwork-sdk/tree/main/python) | This package, its tests and its generator |
