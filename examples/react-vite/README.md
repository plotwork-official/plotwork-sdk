<p align="center">
  <a href="https://plotwork.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://plotwork.dev/brand/logo/plotwork-lockup-on-dark.svg">
      <img alt="Plotwork" src="https://plotwork.dev/brand/logo/plotwork-lockup-on-light.svg" width="240">
    </picture>
  </a>
</p>

# Plotwork with React and Vite

A React app built with Vite that imports a `.diagram` file through [`@plotwork.official/vite`](../../packages/vite/README.md), draws more through [`@plotwork.official/sdk`](../../packages/sdk/README.md), and shows both with `<PlotworkDiagram>` from [`@plotwork.official/viewer`](../../packages/viewer/README.md).

<p>
  <a href="https://stackblitz.com/github/plotwork-official/plotwork-sdk/tree/main/examples/react-vite"><img alt="Open in StackBlitz" src="https://developer.stackblitz.com/img/open_in_stackblitz.svg"></a>
</p>

## TL;DR

| Question | Answer |
|---|---|
| What does it show? | A diagram drawn at build time with drill and trace events in a status line, a playground that draws through the API, and optionally a stable link followed live. |
| Does the bundled diagram need a key? | No. The Plotwork command line in your `devDependencies` draws it offline when Vite builds. |
| Where does the key live? | In `.env.local`, read by the dev server, which adds it to the playground's calls on the way to the API. It has no `VITE_` prefix, so it is never in the bundle. |
| Which versions? | Vite 6.4.3, React 19.3.0, the Plotwork command line 0.8.0, exact versions with a lockfile. |
| What does it need? | Node 22.12 or later. A Plotwork API key for the playground only. |

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/examples/react-vite-dark.png">
    <img alt="The example page: the checkout diagram bundled at build time, and below it the playground with the source beside the picture the API drew" src="../../docs/assets/examples/react-vite-light.png" width="820">
  </picture>
</p>

## Run it

1. Copy this folder, or clone the repository and open `examples/react-vite`.
2. Install: `npm install`
3. Copy the settings: `cp .env.example .env.local`
4. Make a key on the Keys page of [app.plotwork.dev](https://app.plotwork.dev) and set `PLOTWORK_API_KEY` in `.env.local`.
5. Start it: `npm run dev`, then open http://localhost:5173.

| Variable | Needed | What it is |
|---|---|---|
| `PLOTWORK_API_KEY` | For the playground | Your API key, read by the dev server. Never prefix it with `VITE_`. |
| `PLOTWORK_BASE_URL` | No | Where the dev server forwards: `https://api.plotwork.dev` by default, `https://api-preview.plotwork.dev` for preview. |
| `VITE_PLOTWORK_STABLE_LINK` | No | A stable link such as `https://cdn.plotwork.dev/l/<token>.svg`. It is public, so it is safe in the bundle. |

## What you will see

| Part | How it works |
|---|---|
| Bundled at build time | `import checkout, { fingerprint } from './diagrams/checkout.diagram'`. Save the file and the picture updates, keeping your zoom. Hover a box and the status line names it (`onTrace`); press Web tier, which has `part=2`, and it says which part to open (`onDrill`). |
| Playground | Starts with the same file (`?raw`). The browser calls `plotwork.diagrams.validate` and `render` on its own origin with no key; `vite.config.ts` forwards `/v1` to the API and adds `X-API-Key`. Mistakes come back as data with a line, column and hint. |
| Live section | Shown only when `VITE_PLOTWORK_STABLE_LINK` is set: `<PlotworkDiagram src={link} live />`. |
| No key | The playground says how to add one; the bundled diagram still shows. |

## The proxy is for local development

`server.proxy` and `preview.proxy` in `vite.config.ts` exist only in `npm run dev` and `npm run preview`. A deployed app has no Vite server, so it calls the Plotwork API from its own server (a route or function that holds the key), as the [Next.js example](../nextjs/README.md) does. Never put the key in the browser bundle.

## Files

| Path | What it is |
|---|---|
| `vite.config.ts` | The plugin, and the `/v1` proxy that adds the key. |
| `src/diagrams/checkout.diagram` | The diagram bundled at build time. |
| `src/App.tsx` | The bundled diagram, its status line, and the live section. |
| `src/Playground.tsx` | The text box, Draw button, mistakes and picture. |

## See also

| Page | Why |
|---|---|
| [Next.js example](../nextjs/README.md) | Drawing on your own server |
| [Examples](../README.md) | Every example |
| [Vite plugin](../../packages/vite/README.md) | Options, hot reload |
| [Viewer reference](../../packages/viewer/README.md) | Attributes, events, theming |
