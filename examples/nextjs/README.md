<p align="center">
  <a href="https://plotwork.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://plotwork.dev/brand/logo/plotwork-lockup-on-dark.svg">
      <img alt="Plotwork" src="https://plotwork.dev/brand/logo/plotwork-lockup-on-light.svg" width="240">
    </picture>
  </a>
</p>

# Plotwork with Next.js

A Next.js App Router app that checks and draws Plotwork diagrams on its server with [`@plotwork.official/sdk`](../../packages/sdk/README.md) and shows them with `<PlotworkDiagram>` from [`@plotwork.official/viewer`](../../packages/viewer/README.md).

## TL;DR

| Question | Answer |
|---|---|
| What does it show? | A playground: edit a diagram, press Draw, see the picture or every mistake with its line, column and hint. Optionally, a stable link followed live. |
| Where does the key live? | In `.env.local`, read only by the route handler `app/api/draw/route.ts`. It never reaches the browser. |
| Which versions? | Next.js 16.4.2, React 19.3.0, exact versions with a lockfile. |
| Server rendering? | Yes. The viewer renders as the bare element on the server and comes alive in the browser. |
| What does it need? | Node 20.9 or later and a Plotwork API key. |

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/examples/nextjs-dark.png">
    <img alt="The example page: the checkout diagram source in a text box beside the picture the API drew, with a Draw button" src="../../docs/assets/examples/nextjs-light.png" width="820">
  </picture>
</p>

## Run it

1. Copy this folder, or clone the repository and open `examples/nextjs`.
2. Install: `npm install`
3. Copy the settings: `cp .env.example .env.local`
4. Make a key on the Keys page of [app.plotwork.dev](https://app.plotwork.dev) and set `PLOTWORK_API_KEY` in `.env.local`.
5. Start it: `npm run dev`, then open http://localhost:3000.

| Variable | Needed | What it is |
|---|---|---|
| `PLOTWORK_API_KEY` | Yes | Your API key. Server only: never prefix it with `NEXT_PUBLIC_`. |
| `PLOTWORK_BASE_URL` | No | `https://api.plotwork.dev` by default; `https://api-preview.plotwork.dev` for preview. |
| `NEXT_PUBLIC_PLOTWORK_STABLE_LINK` | No | A stable link such as `https://cdn.plotwork.dev/l/<token>.svg`. It is public, so it may reach the browser. Read at build time. |

## What you will see

| Part | How it works |
|---|---|
| Playground | The page posts the source to `/api/draw`. The route calls `plotwork.diagrams.validate`, then `plotwork.diagrams.render` with `scheme: 'auto'`, and returns `{ svg }` or `{ errors }`. Press a mistake's line to put the cursor there. |
| Picture | `<PlotworkDiagram svg={svg} />` in a `'use client'` file. Hover a box to trace its lines; pan, zoom and full screen from the toolbar. |
| Live section | Shown only when `NEXT_PUBLIC_PLOTWORK_STABLE_LINK` is set: `<PlotworkDiagram src={link} live />` swaps in a new version when one is published. |
| No key | The page says how to add one instead of failing. |

## Files

| Path | What it is |
|---|---|
| `app/api/draw/route.ts` | The only code that holds the key. Refuses source over 20,000 characters. |
| `app/playground.tsx` | The client component: text box, Draw button, mistakes and picture. |
| `app/live-diagram.tsx` | The live stable link. |
| `app/page.tsx` | Reads the environment per request and lays out the page. |

## Before you deploy

The route draws whatever it is sent with your key, so on a public site put it behind your own sign-in or a rate limit; every call counts against your key's plan. The dependencies are pinned with a lockfile so a clone installs exactly what CI built.

## See also

| Page | Why |
|---|---|
| [React and Vite example](../react-vite/README.md) | `.diagram` files bundled at build time |
| [Examples](../README.md) | Every example |
| [API client](../../packages/sdk/README.md) | Every `/v1` call, errors, retries |
| [Viewer reference](../../packages/viewer/README.md) | Attributes, events, theming |
