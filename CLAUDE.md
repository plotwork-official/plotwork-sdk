# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

The Plotwork SDK: packages that show and use Plotwork diagrams in other people's projects, built against one language-neutral contract (`spec/`). The diagram engine is not here; the SDK reads the pictures the engine drew. The repository follows the shared standards in the `.standards/` submodule; hooks surface the governing standards as you read and edit files.

## Layout

| Path | What it is |
|---|---|
| `spec/` | The picture contract every SDK reads, and fixtures the engine drew. Fixtures are drawn by the Plotwork command line, never edited by hand. |
| `packages/viewer/` | `@plotwork.official/viewer`: the `<plotwork-diagram>` web component, the React component (`/react`), and the core with no element (`/core`). |
| `examples/` | Pages that use the packages as a reader would. |
| `scripts/` | Repository checks. Not shipped. |

## Commands

| Command | Use |
|---|---|
| `pnpm check` | Type check and test every package, then the no-runtime-dependency guard. Run before you finish. |
| `pnpm build` | Builds every package's `dist` with `tsc`. |
| `pnpm shots` | Builds, then draws the README's screenshots of the viewer from the vanilla example in Chromium, light and dark (`scripts/shots.mjs`). Run after any change to how the viewer looks. |
| `pnpm film` | Builds, then records `docs/film/` frame by frame in light and dark into `docs/film/out/` (MP4 and the README webp). Copy them to `plotwork-assets/public/media/films/sdk/` and push that repository to publish. Needs ffmpeg. |

## Rules that are easy to get wrong

| Rule | Why |
|---|---|
| A published package has no `dependencies` | Supply chain: the only code a user takes on is ours. A framework is an optional peer. `scripts/check-no-runtime-dependencies.mjs` fails otherwise. |
| A new dev dependency needs a reason | Fewer packages, fewer ways in. Prefer `fetch`, `DOMParser`, Web Crypto and the platform. Pin exact versions; installs run no scripts (`.npmrc`). |
| Relative imports end in `.js` | `tsc` emits them as written, and a browser or Node loads the output without a bundler. |
| A picture is never added to the page as markup | It is shown as an `img` from a `blob:` address, and the element builds its own nodes with `createElement`. |
| The core stays equal to the portal's readers | `canvas-view.ts`, `picture-map.ts` and `picture-source.ts` are the portal's (`plotwork-app/apps/app/src/lib/`). Change both, or change the contract in `spec/picture.md` first. |
| Never `cd` into `.standards/` | The hooks switch to strict mode inside it. |
| Nothing is committed or published unless asked | Publishing runs from CI with provenance, never from a laptop. |
