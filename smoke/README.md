# Smoke test

Does what a customer does, against the real preview and production deployments, with the packages exactly as npm serves them. The unit tests prove the code; this proves a release, the API and the CDN work together.

## TL;DR

| Question | Answer |
|---|---|
| How do I run it? | `PLOTWORK_API_KEY=<personal key> node smoke/run.mjs --env preview` (or `production`); for Python, `PLOTWORK_BASE_URL=https://api-preview.plotwork.dev PLOTWORK_API_KEY=<key> python python/smoke.py` with `plotwork` installed. |
| Which versions? | `latest` of every package; `--version 0.1.1`, or `--viewer`, `--vite`, `--sdk` for one each. |
| What key? | A personal key of the smoke test account on that deployment. An organisation key publishes into a private library, which has no public link to watch. |
| When does CI run it? | After every publish, every night, and by hand: [`smoke.yml`](../.github/workflows/smoke.yml). |
| Does it leave anything behind? | Two hosted diagrams (versions a and b, which the API keeps once however often it runs) and the stable link `sdk-smoke`. The app folder is deleted unless `--keep`. |

## What it checks

In a new folder outside this repository it installs `@plotwork.official/viewer`, `/vite` and `/sdk` from npm, with React, Vite and the Plotwork command line, then:

| # | Step | Proves |
|---|---|---|
| 1 | Install from npm | The published packages install with no install scripts |
| 2 | Call the API with the SDK | A wrong key is a typed `401`; vocabulary, validate, render and icon search answer; a diagram's mistake is an answer with a line, not an exception |
| 3 | Build a React app with Vite that imports a `.diagram` file | The plugin draws it with the command line and adds its fingerprint |
| 4 | Publish version a under the stable link `sdk-smoke` | Publishing with an alias makes a stable link |
| 5 | Fetch the stable link | The CDN serves the SVG with `access-control-allow-origin: *` and an ETag, and answers `304` to a check with that ETag |
| 6 | Open the app in Chromium | The bundled diagram loads with the plugin's fingerprint, and the live viewer loads the stable link from another origin |
| 7 | Publish version b | The live viewer swaps it in by itself and reports `plotwork-change` |

The job `PyPI` in the same workflow installs `plotwork` from PyPI into a clean Python and runs [`python/smoke.py`](../python/smoke.py) with the same key: a wrong key refused, vocabulary, validate, render, icon search, and a publish whose picture the CDN serves with CORS.

## Setting it up

| Step | Who | What |
|---|---|---|
| 1 | Owner, once a deployment | In the admin console of preview and of production, make a system identity on Pro (System, New): name it "SDK smoke test" and mint a personal key. |
| 2 | Owner, once | In this repository's Settings, Environments, add `preview` and `production`, each with the secret `PLOTWORK_API_KEY` set to that deployment's key. |
| 3 | Anyone | Actions, Smoke, Run workflow. |

## Contents

| Path | Purpose |
|---|---|
| `run.mjs` | The test: makes the app, installs, runs each step, drives Chromium, writes a summary to the GitHub job. |
| `app/` | The customer's app: `api.mjs` calls the API, `src/main.jsx` shows the diagrams with `<PlotworkDiagram>`, `vite.config.js` adds the plugin. `run.mjs` copies in `spec/fixtures/checkout.diagram`. |

## See also

| Page | Why |
|---|---|
| [Workflows](../.github/workflows/README.md) | Publishing and CI |
| [Picture contract](../spec/picture.md) | Fingerprints and live updates |
