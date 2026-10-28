# @plotwork.official/viewer

Embed interactive Plotwork diagrams in any page: pan and zoom, trace a box's lines, drill from an overview box into its part, light and dark, and live updates when a new version is published. A web component, `<plotwork-diagram>`, and a React component, `<PlotworkDiagram>`.

## TL;DR

| Question | Answer |
|---|---|
| What does it show? | Any SVG the Plotwork engine drew: a file in your repository, a hosted picture, a stable link, or an organisation embed link. |
| What does it install? | Nothing else. No runtime dependencies; React is an optional peer for the React component. |
| Does it run the diagram engine? | No. A Plotwork picture already carries its boxes, lines, parts and source, so the viewer reads them. |
| Does it phone home? | No. It fetches only the address you give it, with no cookie. |
| Can a picture run script in my page? | No. It is shown as an `img`, and the element builds its own nodes without HTML text. |
| Live updates? | `live` checks the address every 60 seconds while the page is in view and swaps in a new version. |
| Pinning? | `fingerprint="sha256-..."` shows the picture only when it is exactly that one. |

## Install

```bash
npm install @plotwork.official/viewer
```

## Any page

```html
<script type="module">
  import '@plotwork.official/viewer/register'
</script>

<plotwork-diagram src="/diagrams/checkout.svg" label="Checkout flow"></plotwork-diagram>
```

## React

```tsx
import { PlotworkDiagram } from '@plotwork.official/viewer/react'

export function Architecture() {
  return <PlotworkDiagram src="https://cdn.plotwork.dev/l/<link>.svg" live onDrill={({ part }) => openPart(part)} />
}
```

It renders as the bare element on a server and comes alive in the browser.

## Where pictures come from

| Source | `src` | Notes |
|---|---|---|
| A file in your repository | `/diagrams/checkout.svg` | Drawn by the Plotwork command line, the MCP server or the GitHub Action. A picture saved with its source gives `source()` back. |
| A hosted picture | `https://cdn.plotwork.dev/d/<token>.svg` | Never changes. |
| A stable link | `https://cdn.plotwork.dev/l/<token>.svg` | Always the latest version of a named diagram. Add `live` to follow it. |
| An organisation's library | `https://cdn.plotwork.dev/o/<token>.svg` | An embed link the owner made for your site. Other sites get a placeholder. The source is never sent. |
| Text you already hold | the `svg` property | A bundler import, or a picture your server fetched. Wins over `src`. |

## Attributes

| Attribute | Values | Default |
|---|---|---|
| `src` | An http or https address, or a path relative to the page | none |
| `theme` | `auto`, `light`, `dark` | `auto`: a picture drawn for both schemes follows the page |
| `live` | present or absent | absent |
| `interval` | seconds between checks for a live picture | `60`, never below `15` |
| `fingerprint` | `sha256-<64 hex>` | none. A pinned picture is never live. |
| `wheel` | `modifier` (Control or Command with the wheel zooms), `zoom` (a plain wheel zooms) | `modifier`; in full screen the wheel always zooms |
| `controls` | `none` hides the toolbar | shown |
| `label` | what the diagram shows, for a screen reader | none |

## Methods, properties and events

| Name | What it does |
|---|---|
| `fit()`, `zoomIn()`, `zoomOut()` | Move the view. |
| `reload()` | Check the address again now. |
| `source()` | The source the picture carries, or `null`. |
| `fingerprint` | The fingerprint of the picture shown. |
| `svg` | Set the picture's text directly. |
| `labels` | Words in your language, over the English defaults. |
| `plotwork-load` | `{ fingerprint, hasSource }` |
| `plotwork-change` | `{ fingerprint, previous }`: a live picture changed. |
| `plotwork-error` | `{ reason }`: `address`, `missing`, `not-a-picture`, `network`, `fingerprint`, or `empty`. |
| `plotwork-drill` | `{ id, part, name }`: a box that opens a part was pressed. You decide what opens. |
| `plotwork-trace` | `{ id }`: the traced box, or `null`. |

## Theming

Set custom properties on the element: `--plotwork-height`, `--plotwork-paper`, `--plotwork-ink`, `--plotwork-trace`, `--plotwork-radius`, `--plotwork-font`. Style the parts with `::part(stage)`, `::part(canvas)`, `::part(toolbar)`, `::part(button)` and `::part(notice)`.

## Content security policy

| Directive | Needs |
|---|---|
| `img-src` | `blob:` (the picture is shown from a `blob:` address) |
| `connect-src` | the origin of each `src`, such as `https://cdn.plotwork.dev` |

## See also

| Page | Why |
|---|---|
| [Picture contract](../../spec/picture.md) | What the viewer reads from a picture |
| [Core](./src/core/README.md) | The parts that need no element |
| [Element](./src/element/README.md) | How `<plotwork-diagram>` is built |
