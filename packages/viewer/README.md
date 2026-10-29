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

Embed interactive Plotwork diagrams in any page: pan and zoom, trace a box's lines, drill from an overview box into its part, light and dark, and live updates when a new version is published. A web component, `<plotwork-diagram>`, and a React component, `<PlotworkDiagram>`. For an app whose people sign in with Plotwork, `<plotwork-library>` lists their diagrams to pick one from.

<p align="center">
  <img alt="The viewer added to an app: npm install, a PlotworkDiagram in App.tsx, then the real component tracing a box, sending a drill event, and showing a new version live" src="https://assets.plotwork.dev/media/films/sdk/readme-light.webp" width="760">
</p>

## TL;DR

| Question | Answer |
|---|---|
| What does it show? | Any SVG the Plotwork engine drew: a file in your repository, a hosted picture, a stable link, or an organisation embed link. |
| What does it install? | Nothing else. No runtime dependencies; React is an optional peer for the React component. |
| Does it run the diagram engine? | No. A Plotwork picture already carries its boxes, lines, parts and source, so the viewer reads them. |
| Does it phone home? | No. It fetches only the address you give it, with no cookie. |
| Private pictures? | A picture of a signed-in person's library needs their token from Sign in with Plotwork: set `token`. Embed links and stable links need none. |
| Can a picture run script in my page? | No. It is shown as an `img`, and the element builds its own nodes without HTML text. |
| Live updates? | `live` checks the address every 60 seconds while the page is in view and swaps in a new version. |
| Pinning? | `fingerprint="sha256-..."` shows the picture only when it is exactly that one. |
| A picker? | `<plotwork-library>` (`/library`): the signed-in person's diagrams, searchable, by keyboard too. |

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
| A signed-in person's library | `https://api.plotwork.dev/v1/library/<id>.svg` | Needs `token`, from [Sign in with Plotwork](#private-pictures) with `library:read`. Private pictures included. |
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
| `token` | A token from Sign in with Plotwork, or a function that returns the current one, sent as `Authorization: Bearer` with each request for `src`. Only to https, or http on `localhost`. |
| `fetch` | A `fetch`-like function the element calls for `src` and live checks, with its own options (`cache`, `credentials: 'omit'`). |
| `plotwork-load` | `{ fingerprint, hasSource }` |
| `plotwork-change` | `{ fingerprint, previous }`: a new version is shown, from a live check or from `svg` set again (a hot reload). |
| `plotwork-error` | `{ reason }`: `address`, `missing`, `signed-out` (a 401: no token, or one that ran out), `not-a-picture`, `network`, `fingerprint`, or `empty`. |
| `plotwork-drill` | `{ id, part, name }`: a box that opens a part was pressed. You decide what opens. |
| `plotwork-trace` | `{ id }`: the traced box, or `null`. |

## Private pictures

An app whose people sign in with Plotwork ([`@plotwork.official/sdk/oauth`](https://www.npmjs.com/package/@plotwork.official/sdk#sign-in-with-plotwork)) shows any diagram of their library, private ones included, from `/v1/library/<id>.svg` with their token. A function is asked before each request, so a live picture keeps working across a refresh.

```tsx
import { Plotwork } from '@plotwork.official/sdk'
import { withRefresh } from '@plotwork.official/sdk/oauth'
import { PlotworkDiagram } from '@plotwork.official/viewer/react'

const token = withRefresh(tokens, { clientId, onRefresh: save })
const plotwork = new Plotwork({ accessToken: token })

<PlotworkDiagram src={plotwork.library.pictureUrl(id)} token={token} live />
```

```js
const diagram = document.querySelector('plotwork-diagram')
diagram.token = () => session.accessToken
diagram.setAttribute('src', `https://api.plotwork.dev/v1/library/${id}.svg`)
```

| Rule | Why |
|---|---|
| The token goes only to an https address, or http on `localhost` | A bearer token over plain http could be read on the way. Anything else is refused as `address`. |
| No cookie is ever sent | The API reads the token, not a session, so a page cannot borrow the person's Plotwork sign-in. |
| Never an API key | A key in a page is a key anyone can copy. A token is the person's own and ends within an hour. |
| A token set after a `signed-out` error loads again | So a page can show the element first and sign in after. |

## Pick from the library

`<plotwork-library>` lists the diagrams the signed-in person can see, newest first, a hundred a page, with a search box that filters by name and folder. It needs a token with `library:read`. Choosing one sends `plotwork-select` with `{ id, name, pictureUrl }`; hand `pictureUrl` to `<plotwork-diagram>` with the same token.

```tsx
import { PlotworkDiagram, PlotworkLibrary } from '@plotwork.official/viewer/react'
import { useState } from 'react'

export function Picker({ token }: { token: () => Promise<string> }) {
  const [picture, setPicture] = useState<string | null>(null)
  return (
    <>
      <PlotworkLibrary token={token} onSelect={({ pictureUrl }) => setPicture(pictureUrl)} />
      {picture !== null && <PlotworkDiagram src={picture} token={token} live />}
    </>
  )
}
```

```html
<script type="module">
  import '@plotwork.official/viewer/library/register'
  const library = document.querySelector('plotwork-library')
  library.token = () => session.accessToken
  library.addEventListener('plotwork-select', (event) => openDiagram(event.detail.pictureUrl))
</script>

<plotwork-library label="Diagrams to insert"></plotwork-library>
```

| Attribute | Values | Default |
|---|---|---|
| `base-url` | The API's address | `https://api.plotwork.dev` |
| `folder` | Keep to a folder and everything in it, such as `Payments/Checkout` | the whole library |
| `label` | The list's name, for a screen reader | `Your Plotwork diagrams` |
| `theme` | `auto`, `light`, `dark` | `auto`: follows the page |

| Name | What it does |
|---|---|
| `token`, `fetch`, `labels` | As for `<plotwork-diagram>`. Without a token or a `fetch` it asks the person to sign in and sends no request. |
| `items`, `selected` | The diagrams loaded, and the id chosen last. |
| `reload()` | Reads the library again from its first page. |
| `plotwork-select` | `{ id, name, pictureUrl }` |
| `plotwork-error` | `{ reason }`: `signed-out` (no token, or a 401), `forbidden` (the grant lacks `library:read`), `network`, or `address`. |

The search box's down arrow moves into the list; the arrows, Home and End move in it, Enter or Space chooses, and Escape or typing goes back to the search. Style it through `--plotwork-paper`, `--plotwork-ink`, `--plotwork-accent`, `--plotwork-control`, `--plotwork-radius`, `--plotwork-font` and `--plotwork-height`, and the parts `stage`, `search`, `list`, `option`, `badge`, `notice` and `button`.

## Theming

Set custom properties on the element: `--plotwork-height`, `--plotwork-paper`, `--plotwork-ink`, `--plotwork-trace`, `--plotwork-radius`, `--plotwork-font`. Style the parts with `::part(stage)`, `::part(canvas)`, `::part(toolbar)`, `::part(button)` and `::part(notice)`.

## Content security policy

| Directive | Needs |
|---|---|
| `img-src` | `blob:` (the picture is shown from a `blob:` address) |
| `connect-src` | the origin of each `src`, such as `https://cdn.plotwork.dev`, and `https://api.plotwork.dev` for pictures of a library |

## See also

| Page | Why |
|---|---|
| [Picture contract](https://github.com/plotwork-official/plotwork-sdk/blob/main/spec/picture.md) | What the viewer reads from a picture |
| [Core](https://github.com/plotwork-official/plotwork-sdk/blob/main/packages/viewer/src/core/README.md) | The parts that need no element |
| [Element](https://github.com/plotwork-official/plotwork-sdk/blob/main/packages/viewer/src/element/README.md) | How `<plotwork-diagram>` is built |
| [Library](https://github.com/plotwork-official/plotwork-sdk/blob/main/packages/viewer/src/library/README.md) | How `<plotwork-library>` is built |
| [API client](https://www.npmjs.com/package/@plotwork.official/sdk#sign-in-with-plotwork) | Sign in with Plotwork, to get the token |
