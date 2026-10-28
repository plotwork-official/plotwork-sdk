<p align="center">
  <a href="https://plotwork.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://plotwork.dev/brand/logo/plotwork-lockup-on-dark.svg">
      <img alt="Plotwork" src="https://plotwork.dev/brand/logo/plotwork-lockup-on-light.svg" width="240">
    </picture>
  </a>
</p>

# @plotwork.official/vite

<p>
  <a href="https://www.npmjs.com/package/@plotwork.official/vite"><img alt="npm" src="https://img.shields.io/npm/v/%40plotwork.official%2Fvite?logo=npm&color=0f766e"></a>
  <img alt="Provenance" src="https://img.shields.io/badge/provenance-signed-0f766e?logo=sigstore&logoColor=white">
  <img alt="Runtime dependencies" src="https://img.shields.io/badge/runtime%20dependencies-0-0f766e?logo=dependabot&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5%2B-646cff?logo=vite&logoColor=white">
</p>

Import Plotwork `.diagram` files in a Vite app. Each import is drawn to SVG at build time by the Plotwork command line, redrawn when you save the file, and shown with [`@plotwork.official/viewer`](https://www.npmjs.com/package/@plotwork.official/viewer). No diagram engine reaches the browser.

## TL;DR

| Question | Answer |
|---|---|
| What does an import give? | The SVG text as the default export, and its `fingerprint` (`sha256-<hex>`). |
| Who draws it? | The Plotwork command line your project installs (`@buun_group/plotwork`), offline. The plugin carries no engine. |
| What happens on save? | The file is drawn again and the module updates; the viewer shows it as a new version and keeps the reader's zoom. |
| And a mistake in the diagram? | The build stops with the command line's own message: the line, the column and a hint, in Vite's overlay. |
| What does it install? | Nothing else. Vite and the command line are peers you already have. |

## Install

```bash
npm install --save-dev @plotwork.official/vite @buun_group/plotwork
npm install @plotwork.official/viewer
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { plotwork } from '@plotwork.official/vite'

export default defineConfig({ plugins: [plotwork()] })
```

Add the types of a `.diagram` import to `tsconfig.json`:

```json
{ "compilerOptions": { "types": ["@plotwork.official/vite/client"] } }
```

## Use

```tsx
import { PlotworkDiagram } from '@plotwork.official/viewer/react'
import checkout from './diagrams/checkout.diagram'

export function Architecture() {
  return <PlotworkDiagram svg={checkout} label="Checkout flow" />
}
```

Any framework: give the text to the element's `svg` property.

```ts
import '@plotwork.official/viewer/register'
import checkout, { fingerprint } from './diagrams/checkout.diagram'

const viewer = document.querySelector('plotwork-diagram')
viewer.svg = checkout
```

## Options

| Option | Default | What it does |
|---|---|---|
| `scheme` | `'auto'` | `auto` draws one picture that follows the reader's light or dark setting; `light` or `dark` draws one scheme. |
| `theme` | the header's | The colour theme: `plotwork`, `slate`, `ocean`, `forest`, `sunset`, `mono`, `contrast`. |
| `embedSource` | `true` | Keep the source in the SVG, so `source()` on the viewer gives it back. Set `false` to ship only the picture. |
| `include` | `/\.diagram$/` | Which files are diagrams. |
| `cli` | the installed command line | `{ command, args }` to run another build of it. |

`?raw` and `?url` imports are left to Vite, so `import text from './a.diagram?raw'` is still the source text.

## See also

| Page | Why |
|---|---|
| [Viewer](https://github.com/plotwork-official/plotwork-sdk/tree/main/packages/viewer) | The component that shows the picture |
| [Writing diagrams](https://docs.plotwork.dev) | The `.diagram` language |
| [Command line](https://docs.plotwork.dev/cli/commands) | `render`, which this plugin runs |
