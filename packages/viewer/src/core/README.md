# Core

What the viewer knows about a Plotwork picture and its canvas, with no custom element in it: the arithmetic of pan and zoom, the boxes and lines read from a picture's text, its source, its colour scheme, its fingerprint, how it is fetched, and how a live picture is watched. Every function is tested without a browser page.

## Standards

Code here follows:

- [Type-driven design](../../../../.standards/docs/standards/core/type-driven-design.md) - a mistake is a typed result (`SourceReading`, `LoadFailure`), never an exception the page has to catch
- [Security](../../../../.standards/docs/standards/core/security.md) - a picture's text is parsed into a document never attached to the page, and only numbers, ids, words and checked path data leave it
- [Dependencies](../../../../.standards/docs/standards/core/dependencies.md) - nothing is imported: `fetch`, `DOMParser` and Web Crypto do the work

## Contents

| Path | Purpose |
|---|---|
| `canvas-view.ts` | Where the picture sits and how big it is drawn: fit, zoom limits, zoom at a point, pan, pinch, the wheel's intent, the dot grid. Kept equal to the portal's `apps/app/src/lib/canvas-view.ts`. |
| `picture-map.ts` | The boxes and lines of a painted picture (`readTraceMap`), the lines of one box (`traceOf`), and the box under a point (`nodeAt`, `drillNodeAt`). Kept equal to the portal's `picture-trace.ts`; `spec/picture.md` is the contract. |
| `picture-source.ts` | The source a picture carries in its `<metadata data-format="buun-diagram">` (`readEmbeddedSource`). |
| `picture-scheme.ts` | The `theme` choice, and `withScheme`, which sets `data-scheme` on an `auto` picture's root to force light or dark. |
| `fingerprint.ts` | `sha256-<hex>` of a picture's text: what `fingerprint` pins and what an organisation embed link sends as its `ETag`. |
| `picture-loader.ts` | Fetching a picture by address with no cookie, a size cap and a timeout, and revalidating it for a live viewer. |
| `live-watch.ts` | Checking a live picture for a new version on an interval, only while the page is in view. |
| `limits.ts` | The numbers: zoom range and steps, padding, size cap, timeout, live interval. |
| `index.ts` | The barrel. |
