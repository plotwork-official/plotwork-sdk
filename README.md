# Plotwork SDK

Show interactive Plotwork diagrams in your own pages: from files in your repository, from hosted links, or from your organisation's library, kept up to date when a new version is published.

[Plotwork](https://plotwork.dev) is a small text language and renderer for flow, sequence, database and cloud diagrams that AI agents and people write. Its command line, MCP server and GitHub Action draw `.diagram` files to SVG pictures; this SDK shows those pictures with every interaction the Plotwork portal has.

> **Status:** `@plotwork.official/viewer` is built and tested here and not yet on npm. The packages below marked planned are designed, not built.

## TL;DR

| Question | Answer |
|---|---|
| What does it show? | Any picture the Plotwork engine drew: a file in your repository, a hosted picture, a stable link, or an organisation embed link. |
| What does the viewer do? | Pan and zoom, trace a box's lines, drill from an overview box into its part, light and dark, full screen, live updates. |
| Which frameworks? | Any: `<plotwork-diagram>` is a web component. A React component is included. |
| What does it install? | Nothing else. No package of the SDK has a runtime dependency, and CI fails if one appears. |
| Does it phone home? | No. It fetches only the address you give it, with no cookie. |
| Does it run the diagram engine in the browser? | No. A picture already carries its boxes, lines, parts and source. |
| Other languages? | Every package is built against [`spec/`](./spec/README.md), the same contract and fixtures in every language. |
| Licence | MIT. |

## Packages

| Package | Status | What it is |
|---|---|---|
| [`@plotwork.official/viewer`](./packages/viewer/README.md) | built | `<plotwork-diagram>`, `<PlotworkDiagram>` for React, and the core with no element. |
| `@plotwork.official/vite` | planned | `import arch from './arch.diagram'`: drawn at build time by the command line, so no engine ships to the browser. |
| `@plotwork.official/sdk` | planned | A typed client for the hosted `/v1` API, on `fetch` only. |
| `plotwork` (PyPI) | planned | The API client for Python, standard library only. |

## Show a diagram

```bash
npm install @plotwork.official/viewer
```

```html
<script type="module">
  import '@plotwork.official/viewer/register'
</script>

<plotwork-diagram src="/diagrams/checkout.svg" label="Checkout flow"></plotwork-diagram>
```

```tsx
import { PlotworkDiagram } from '@plotwork.official/viewer/react'

<PlotworkDiagram src="https://cdn.plotwork.dev/l/<link>.svg" live onDrill={({ part }) => openPart(part)} />
```

## Keep it current

| You want | Use |
|---|---|
| The picture in your repository, redrawn with the code | The Plotwork GitHub Action or command line writes the SVG; point `src` at it. |
| The latest published version, without a redeploy | A stable link (`/l/`) or an organisation embed link (`/o/`) with `live`. |
| Exactly one version, refused if it changes | `fingerprint="sha256-..."`. |

## Supply chain

| Measure | Where |
|---|---|
| No runtime dependencies in any published package | `scripts/check-no-runtime-dependencies.mjs`, in `pnpm check` and CI |
| Exact versions, frozen lockfile, no install scripts | `.npmrc`, CI |
| New versions wait a week | `pnpm-workspace.yaml`, `renovate.json` |
| Actions pinned to a commit | `.github/workflows/` |
| Published only from CI, by npm trusted publishing (OIDC, no token), with provenance, under `@plotwork.official` | [`.github/workflows/publish.yml`](./.github/workflows/README.md) |

## Develop

```bash
git clone --recurse-submodules git@github.com:plotwork-official/plotwork-sdk.git
pnpm install
pnpm check
```

The repository follows the engineering standards in `.standards/`, with hooks that surface them to Claude Code. See [CLAUDE.md](./CLAUDE.md).

## See also

| Page | Why |
|---|---|
| [Viewer](./packages/viewer/README.md) | Attributes, events, theming, content security policy |
| [Picture contract](./spec/picture.md) | What every SDK reads from a picture |
| [Example page](./examples/vanilla/index.html) | The viewer on a plain page |
