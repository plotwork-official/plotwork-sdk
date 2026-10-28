# Diagrams

The Plotwork diagrams the repository README shows. Each `.diagram` file is the source; the `.svg` beside it is drawn from it by the Plotwork command line in both colour schemes, with its source inside, and is never edited by hand.

## Contents

| Source | Picture | Shows |
|---|---|---|
| `sources.diagram` | `sources.svg` | Where the viewer's pictures come from: a repository, a stable link, an embed link. |
| `live-update.diagram` | `live-update.svg` | How a live viewer sees a new version: revalidation, 304, and the swap. |

## Draw them again

```bash
npx @buun_group/plotwork render docs/diagrams/sources.diagram --scheme auto --out docs/diagrams/sources.svg
npx @buun_group/plotwork render docs/diagrams/live-update.diagram --scheme auto --out docs/diagrams/live-update.svg
```
