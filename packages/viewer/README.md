<p align="center">
  <a href="https://plotwork.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://plotwork.dev/brand/logo/plotwork-lockup-on-dark.svg">
      <img alt="Plotwork" src="https://plotwork.dev/brand/logo/plotwork-lockup-on-light.svg" width="240">
    </picture>
  </a>
</p>

# @plotwork.official/viewer

<p>
  <a href="https://www.npmjs.com/package/@plotwork.official/viewer"><img alt="npm" src="https://img.shields.io/npm/v/%40plotwork.official%2Fviewer?logo=npm&color=0f766e"></a>
  <img alt="Provenance" src="https://img.shields.io/badge/provenance-signed-0f766e?logo=sigstore&logoColor=white">
  <img alt="Runtime dependencies" src="https://img.shields.io/badge/runtime%20dependencies-0-0f766e?logo=dependabot&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/types-included-3178c6?logo=typescript&logoColor=white">
  <a href="https://github.com/plotwork-official/plotwork-sdk/blob/main/LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-52514e"></a>
</p>

Embed interactive Plotwork diagrams in any page: pan and zoom, trace a box's lines, drill from an overview box into its part, light and dark, and live updates when a new version is published. A web component, `<plotwork-diagram>`, and a React component, `<PlotworkDiagram>`.

<p align="center">
  <img alt="The viewer showing a checkout flow, with the Orders API box traced: its three lines and the boxes they reach are highlighted" src="https://raw.githubusercontent.com/plotwork-official/plotwork-sdk/main/docs/assets/viewer-light.png" width="760">
</p>

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
| [Picture contract](https://github.com/plotwork-official/plotwork-sdk/blob/main/spec/picture.md) | What the viewer reads from a picture |
| [Core](https://github.com/plotwork-official/plotwork-sdk/blob/main/packages/viewer/src/core/README.md) | The parts that need no element |
| [Element](https://github.com/plotwork-official/plotwork-sdk/blob/main/packages/viewer/src/element/README.md) | How `<plotwork-diagram>` is built |
