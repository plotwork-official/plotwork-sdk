# Examples

Apps that use the Plotwork packages as a reader would. Each installs the published packages from npm, with exact versions, and runs on its own.

## TL;DR

| Question | Answer |
|---|---|
| Which one should I start from? | Next.js for an app with a server, React and Vite for a single-page app, vanilla for any page without a framework. |
| Do I need an API key? | Only to draw through the API. The vanilla page and the bundled diagram in the Vite app need none. |
| Where does the key go? | In `.env.local` (ignored by git), read on a server only. Never in browser code. |
| Are they tested? | CI installs each from its lockfile, swaps in the packages built from the change, then type checks and builds it. |

## The examples

| Example | Shows | Run it |
|---|---|---|
| [`vanilla`](./vanilla/index.html) | `<plotwork-diagram>` on a plain page, tracing and a drill event. | From the repository root: `pnpm build`, then serve the root and open `/examples/vanilla/`. |
| [`react-vite`](./react-vite/README.md) | A `.diagram` file bundled with `@plotwork.official/vite`, drill and trace events, and a playground that draws through the API with the key kept on the dev server. | `npm install`, `cp .env.example .env.local`, add your key, `npm run dev`. |
| [`nextjs`](./nextjs/README.md) | A route handler that checks and draws with `@plotwork.official/sdk`, mistakes listed with line, column and hint, server rendering, and a live stable link. | `npm install`, `cp .env.example .env.local`, add your key, `npm run dev`. |

The `react-vite` and `nextjs` folders are not part of the pnpm workspace, so they install from npm exactly as your project would. Each keeps its `package-lock.json`: a clone installs the versions CI built, checked against their integrity hashes.

## Screenshots

`pnpm shots:examples` installs and builds each app in a temporary folder, serves the build, and writes `docs/assets/examples/<name>-<light|dark>.png`. Set `PLOTWORK_API_KEY` first to draw the playground; without it the pictures show the playground asking for a key.

## See also

| Page | Why |
|---|---|
| [SDK overview](../README.md) | What each package does |
| [Viewer reference](../packages/viewer/README.md) | Attributes, events, theming |
| [Vite plugin](../packages/vite/README.md) | Importing `.diagram` files |
| [API client](../packages/sdk/README.md) | Every `/v1` call |
