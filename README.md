# Plotwork SDK

Embed the interactive Plotwork diagram viewer in your own pages, and script Plotwork from TypeScript.

[Plotwork](https://plotwork.dev) is a small text language and renderer for flow, sequence, database and cloud diagrams that AI agents and people write. This SDK brings the viewer from the Plotwork portal to wherever your team reads: a docs site, a Backstage portal, an internal wiki or your own app.

> **Status:** in design. Nothing is published to npm yet. This repository will hold the public source of the SDK packages, and its README says what they will do and how they will be set up. Watch the repository for the first release.

## TL;DR

| Question | Answer |
|---|---|
| What is it? | Two packages: an embeddable diagram viewer, and a typed client for the Plotwork API and engine. |
| What does the viewer do? | Pan and zoom, tracing a box's lines, drill-down from an overview box into its part, notes, view toggles (legend, numbers, motion, dark paper), and full screen, in light and dark. |
| Which frameworks? | Any: the viewer is a web component, `<plotwork-diagram>`. A thin React wrapper is included. |
| Does it phone home? | No. It sends nothing by default and loads only the diagrams you point it at. |
| Do I need an account? | Not to show a public diagram or a picture you host. A private organisation diagram needs a key or a token your page supplies. |
| Licence | MIT. |

## Packages

| Package | What it is |
|---|---|
| `@buun_group/plotwork-viewer` | The viewer as a web component (`<plotwork-diagram>`) and a React component (`<PlotworkDiagram>`). Shows a Plotwork SVG with every interaction the portal has. |
| `@buun_group/plotwork-sdk` | A typed client for the hosted `/v1` API, and the engine's workflows (draw, validate, import a file, publish a series) as functions you can combine in your own scripts and CI. |

## Setting it up

The setup below is the intended shape of the first release; names may still change before it ships.

### Show a diagram on any page

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@buun_group/plotwork-viewer/dist/plotwork-viewer.js"></script>

<plotwork-diagram src="https://cdn.plotwork.dev/l/your-stable-link.svg" theme="auto"></plotwork-diagram>
```

`src` takes a public Plotwork link or any Plotwork SVG you host yourself. A picture that carries its source unlocks the source view, the view toggles and drill-down.

### Use it in React

```bash
npm install @buun_group/plotwork-viewer
```

```tsx
import { PlotworkDiagram } from '@buun_group/plotwork-viewer/react'

export function Architecture() {
  return <PlotworkDiagram src="/diagrams/architecture.svg" theme="auto" drillDown toggles={['legend', 'numbered', 'dark']} />
}
```

### Drill-down between parts

A system too big for one picture is published as a series: an overview, then a part for each piece, where each overview box names its part with `part=`. Give the viewer the whole series and a press on a box opens that part beside the diagram, with a line from the box to it.

```html
<plotwork-diagram series="https://cdn.plotwork.dev/s/your-series.json"></plotwork-diagram>
```

### Script Plotwork

```bash
npm install @buun_group/plotwork-sdk
```

```ts
import { Plotwork } from '@buun_group/plotwork-sdk'

const plotwork = new Plotwork({ apiKey: process.env.PLOTWORK_API_KEY })

// Import a Terraform folder, check it, and publish every part as one series.
const imported = await plotwork.importSource({ format: 'terraform', files })
const series = await plotwork.publishSeries(imported, { folder: 'Platform/Azure' })
console.log(series.overview.viewUrl)
```

Keep the key in an environment variable or your CI's secret store, never in a file you commit.

## Privacy

The viewer and the SDK send nothing by default: no analytics, no telemetry, no requests but the diagrams and the API calls you ask for. Diagram source is drawn in your browser or on your own machine unless you call the hosted API.

## Where the source lives

The SDK is built and tested in Plotwork's main repository and mirrored here on each release, the same way as the [command line](https://github.com/plotwork-official/plotwork-cli). Issues and ideas are welcome here.

## See also

| Link | Why |
|---|---|
| [plotwork.dev](https://plotwork.dev) | What Plotwork is |
| [Documentation](https://docs.plotwork.dev) | The diagram language, the API and the guides |
| [plotwork-cli](https://github.com/plotwork-official/plotwork-cli) | Draw and check diagrams from a terminal or CI |
| [plotwork-action](https://github.com/plotwork-official/plotwork-action) | Keep diagrams in step with the code in GitHub Actions |
| [LICENSE](LICENSE) | MIT |
