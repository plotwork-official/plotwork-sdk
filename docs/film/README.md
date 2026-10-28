# Film

A 20 second film of the viewer added to an app, played by the real component built from this repository: `npm install`, a `<PlotworkDiagram>` typed into `App.tsx`, the viewer tracing Orders API, a press on the Web tier box sending `plotwork-drill`, `plotwork publish`, and version 2 shown live with `plotwork-change`.

## TL;DR

| Question | Answer |
|---|---|
| How is it recorded? | `pnpm film`: every frame is drawn at its time by `film.seek` and screenshot, so every run is the same. |
| Where does it go? | `docs/film/out/` (ignored by git): `landscape-<scheme>.mp4` and `readme-<scheme>.webp`. Copy them to `plotwork-assets/public/media/films/sdk/` and push that repository; it serves them at `assets.plotwork.dev/media/films/sdk/`. |
| Is it on YouTube? | No: the folder has no `youtube.json`. Add one there to have that repository's workflow upload it. |
| Can I watch it live? | Serve the repository root and open `docs/film/index.html`; it plays in real time. |

## Contents

| Path | Purpose |
|---|---|
| `index.html`, `film.css` | The stage: an editor, a browser with the app, and the end card. |
| `film.js` | The timeline: what is typed and when, the pointer's path, and the moments the component is driven (mount, press, a new version). |
| `checkout.diagram`, `checkout.svg` | Version 1 of the diagram the app shows. |
| `checkout-v2.diagram`, `checkout-v2.svg` | Version 2, with Payments added, which arrives live. |

## Draw the pictures again

```bash
npx @buun_group/plotwork render docs/film/checkout.diagram --scheme auto --out docs/film/checkout.svg
npx @buun_group/plotwork render docs/film/checkout-v2.diagram --scheme auto --out docs/film/checkout-v2.svg
```
