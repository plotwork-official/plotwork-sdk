# Examples

Apps that use the Plotwork packages as a reader would. Each installs the published packages from npm, with exact versions, and runs on its own.

## TL;DR

| Question | Answer |
|---|---|
| Which one should I start from? | Next.js for an app with a server, React and Vite for a single-page app, vanilla for any page without a framework. |
| Do I need an API key? | Only to draw through the API. The vanilla page, the bundled diagram in the Vite app, and Sign in with Plotwork need none. |
| How do people sign in with Plotwork? | Next.js as a confidential app (the server keeps the secret and the tokens), React and Vite as a public app (no server, PKCE only). Register the app under Developers, then Developer apps, in the portal. |
| Where does the key go? | In `.env.local` (ignored by git), read on a server only. Never in browser code. |
| Are they tested? | CI installs each from its lockfile with the packages built from the change in place of npm's, then type checks and builds it. |

## The examples

| Example | Shows | Run it |
|---|---|---|
| [`vanilla`](./vanilla/index.html) | `<plotwork-diagram>` on a plain page, tracing and a drill event. | From the repository root: `pnpm build`, then serve the root and open `/examples/vanilla/`. |
| [`react-vite`](./react-vite/README.md) | A `.diagram` file bundled with `@plotwork.official/vite`, drill and trace events, Sign in with Plotwork as a public app with `<PlotworkLibrary>`, and a playground that draws through the API with the key kept on the dev server. | `npm install`, `cp .env.example .env.local`, add your key or client id, `npm run dev`. |
| [`nextjs`](./nextjs/README.md) | Sign in with Plotwork as a confidential app with the tokens in a sealed cookie, the person's library and pictures through the server, a route handler that checks and draws with an API key, server rendering, and a live stable link. | `npm install`, `cp .env.example .env.local`, add your key or app, `npm run dev`. |

The `react-vite` and `nextjs` folders are not part of the pnpm workspace, so they install from npm exactly as your project would. Each keeps its `package-lock.json`: a clone installs the versions CI built, checked against their integrity hashes.

## Ahead of a release

An example moves to a new release of the packages in the same change as the packages, before that release is on npm. Until it is, `npm install` in the example stops with `ETARGET`, and the lockfile still names the release before. CI does not need npm to have it: it builds and packs the packages from the change and installs them over the example in one step, with every other package at its locked version.

```sh
pnpm build
pnpm -r --filter "./packages/*" exec pnpm pack --pack-destination ../../dist-packs
cd examples/nextjs
npm install --no-save --ignore-scripts --no-audit --no-fund ../../dist-packs/plotwork.official-*.tgz
npm run typecheck && npm run build
```

Once the release is on npm, run `npm install --ignore-scripts` in each example to move its lockfile to it.

## Screenshots

`pnpm shots:examples` installs and builds each app in a temporary folder, serves the build, and writes `docs/assets/examples/<name>-<light|dark>.png`. Set `PLOTWORK_API_KEY` first to draw the playground; without it the pictures show the playground asking for a key. Add `--local` to install the packages packed into `dist-packs/`, ahead of a release. The sign-in sections are drawn signed out.

## See also

| Page | Why |
|---|---|
| [SDK overview](../README.md) | What each package does |
| [Viewer reference](../packages/viewer/README.md) | Attributes, events, theming |
| [Vite plugin](../packages/vite/README.md) | Importing `.diagram` files |
| [API client](../packages/sdk/README.md) | Every `/v1` call |
| [Sign in with Plotwork](../packages/sdk/README.md#sign-in-with-plotwork) | The OAuth helpers both sign-in examples use |
