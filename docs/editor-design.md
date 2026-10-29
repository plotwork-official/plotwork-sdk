# Design: `@plotwork.official/editor`

A proposal for an embeddable editor: a page shows a `.diagram` source beside its picture, a reader edits the source, and the picture is drawn again. Nothing here is built. It is written for the owner to decide on before any code.

## TL;DR

| Question | Answer |
|---|---|
| What is it? | `<plotwork-editor>`, a web component with a code pane and the existing viewer, and `<PlotworkEditor>` for React. |
| Who is it for? | Docs sites, internal portals and product playgrounds that want a reader to try or change a diagram in the page. |
| Does it run the engine? | No. The engine is not in the browser. Every check and drawing goes to a `render` the page chooses. |
| Where does drawing happen? | The Plotwork API through the page's own proxy, the API with a Sign in with Plotwork token, a self-hosted engine, or a function the page gives. |
| Does the API key reach the browser? | Never. A proxy holds it on a server, or the reader signs in and the token is theirs. |
| What does it install? | Nothing. No runtime dependencies; React is an optional peer, as in the viewer. |
| How is the code pane built? | A plain `textarea` with line numbers and mistake markers. CodeMirror is not a dependency. |
| Who saves? | The page. The editor sends events; `publish` is an opt-in call the page wires. |
| First phase? | The MVP below: the pane, debounced validation, a redraw, the three events, a proxy recipe. |

## What it is for

| Reader | What they do |
|---|---|
| A docs site | Shows an example the reader can change and see redrawn, then copy. |
| An internal portal | Lets a team keep the `.diagram` beside a page and fix it in place, saving through the portal's own API. |
| A product playground | Offers Plotwork to its own users with their own sign-in, as the `react-vite` and `nextjs` examples do by hand today. |

It is not the portal's editor. The portal has visual editing, versions, boards and presence; this package edits text and shows the picture, so a page can take it with no account system of ours.

## The hard constraint: no engine in the browser

The engine (parser, ELK layout, painter, icon art) is in `plotwork-app`, not in this repository, and it is too large for a page: ELK alone is about 500 KiB and the icon art more than a megabyte. The SDK's rule is that it reads pictures the engine drew. So the editor never parses or lays out a diagram itself. It calls one function the page provides:

```ts
interface EditorBackend {
  validate(source: string, signal: AbortSignal): Promise<ValidateResponse>
  render(source: string, options: { scheme: 'light' | 'dark' | 'auto' }, signal: AbortSignal): Promise<RenderResponse>
}
```

The types are the SDK's generated `ValidateResponse` and `RenderResponse`, so a mistake arrives as a `Diagnostic` with `line`, `column`, `length`, `hint` and sometimes `fix`. The editor imports only types from `@plotwork.official/sdk`, so the SDK is an optional peer, not a dependency.

| Backend | How | Key |
|---|---|---|
| The page's proxy (recommended) | `apiBackend({ baseUrl: '/api/plotwork' })`: the SDK client pointed at the page's own route, which adds `X-API-Key` on the server and forwards only `/v1/diagrams/validate` and `/v1/diagrams/render`. | On the page's server only. |
| Sign in with Plotwork | `apiBackend({ token: () => session.accessToken })`: the reader signs in (OAuth 2.1 with PKCE, scope `diagrams:use`, being built in the API) and the token goes as `Authorization: Bearer`. Calls are metered to the reader. | The reader's own short-lived token. |
| A self-hosted engine | `apiBackend({ baseUrl: 'https://plotwork.internal' })`: `apps/selfhost` serves the same `/v1` routes inside the company's network. | None, or the company's own gateway. |
| A function of the page's own | Any object with `validate` and `render`, for a page that draws another way (a worker of its own, a test double). | The page's business. |

The editor refuses to start with an `apiKey` option, so a key cannot be put in the browser by mistake, and its README says why. The proxy recipe ships as a ten-line handler for Next.js, a Cloudflare Worker and Express in `examples/`, each with a size cap on the body and the two routes allowed.

Open dependency: the SDK client takes `apiKey`, `baseUrl` and `fetch` today. Bearer tokens need either an `accessToken` option (a function, so a refresh is the caller's) or a `fetch` wrapper; the first is cleaner and is a small change to `packages/sdk`.

## The component

```html
<plotwork-editor label="Checkout flow" theme="auto">
  <script type="text/plain" slot="source">flow "Checkout"
node web service "Web tier"
node api service "Orders API"
web -> api : "places order"</script>
</plotwork-editor>
```

| Part | What it does |
|---|---|
| Code pane | A `textarea` over a line-number gutter and a marker layer, in the element's shadow root. Tab indents, Shift+Tab outdents, Escape leaves the pane so Tab is never a trap. Monospace, no syntax colours in the MVP. |
| Mistakes | Each `Diagnostic` underlines `line`, `column`, `length` in the marker layer and marks the gutter; a list under the pane shows message and hint, and pressing one moves the caret there. A `fix` is a button that applies it. |
| Picture | A `<plotwork-diagram>` from the viewer, given the drawn text through its `svg` property, so pan, zoom, trace, drill and full screen come free. An update keeps the view, as hot reload does today. |
| Layout | Side by side above about 720 px, stacked below; `layout="stacked"` or `"split"` forces one. Styled through `part` and `--plotwork-*` like the viewer. |
| Copy | Every word in a `labels` object merged over English defaults, as the viewer's `copy.ts` does. |

### Timing

| Step | When |
|---|---|
| `validate` | 300 ms after the last keystroke. A newer keystroke aborts the call in flight. |
| `render` | After a `valid: true` answer. The last good picture stays on screen while the source is wrong, dimmed, with the mistake count over it. |
| Limits | Source over 120,000 characters (the API's `maxLength`) is refused before any call. A 429 or 503 waits for `Retry-After` and says so in the status line. |

### Attributes and properties

| Name | Kind | Meaning |
|---|---|---|
| `source` | property | The text in the pane. Setting it does not send `plotwork-input`. |
| `backend` | property | The `EditorBackend`. Without one the pane works and the picture says it has nowhere to draw. |
| `readonly` | attribute | Shows the source and the picture without editing, a better code block. |
| `theme` | attribute | `light`, `dark` or `auto`, passed to `render` and the viewer. |
| `delay` | attribute | Milliseconds before `validate`, 300 by default, never under 150. |
| `label` | attribute | The diagram's name, for the pane's and the canvas's accessible names. |
| `labels` | property | Words in the page's language. |

## Events

Each is a `CustomEvent` that bubbles and is `composed`, like the viewer's.

| Event | Detail | When |
|---|---|---|
| `plotwork-input` | `{ source }` | The reader changed the text. Sent on every change, not debounced, so a page can keep a draft. |
| `plotwork-valid` | `{ source, valid, errors, warnings }` | A `validate` answered for the text now in the pane. Stale answers are dropped. |
| `plotwork-render` | `{ source, svg, fingerprint, warnings }` | A new picture is shown. `fingerprint` is the viewer's `sha256-<hex>`. |
| `plotwork-error` | `{ reason }` | The backend failed (`network`, `unauthorised`, `rate-limited`, `unavailable`). The pane keeps working. |

The viewer's own events (`plotwork-trace`, `plotwork-drill`) still reach the page from the inner element.

## Saving

The editor holds no storage and sends nothing on its own. The page saves on `plotwork-input` or on its own button, where it likes: a file in its repository through its API, a database, a commit.

`publish` is an optional method, `editor.publish()`, that calls `backend.publish(source)` only when the backend has one. With a proxy, the page decides whether that route exists at all; with a Sign in with Plotwork token it publishes to the reader's own account and needs a scope beyond `diagrams:use`, which is an open question below. The editor never publishes on its own.

## Accessibility

| Need | How |
|---|---|
| A name for each part | The pane is a labelled `textarea` (`label` plus "diagram source"); the picture is the viewer's named canvas. |
| Mistakes said | A polite live region says "2 mistakes" or "No mistakes" after each validation, not on each keystroke. Each mistake is also text in the list, not colour alone. |
| Keyboard | Tab indents only inside the pane; Escape then Tab moves on. F8 and Shift+F8 move between mistakes, as in common editors. |
| Motion | The picture's redraw has no animation under `prefers-reduced-motion`. |
| Zoom | The pane reflows at 400 % and keeps a 44 px target for the gutter's markers. |

## Sizes

These are budgets, not measurements. The viewer's element and core in `dist` are 22 KiB with gzip today, not minified.

| Piece | Budget, gzip |
|---|---|
| `<plotwork-editor>` without the viewer | 10 KiB |
| With the viewer | 32 KiB |
| React wrapper | 1 KiB, React as an optional peer |
| Richer editing (phase 2) | Its own entry, `/rich`, so a page that does not use it pays nothing |

A size check in `pnpm check` holds the budget, as the no-runtime-dependency guard holds the supply chain.

## Phases

| Phase | Scope |
|---|---|
| 1. MVP | The `textarea` pane with line numbers and markers, debounced `validate` and `render`, the viewer for the picture, the four events, `apiBackend` with a proxy and a self-hosted engine, the React wrapper, the proxy recipes in `examples/`, tests in jsdom and a Chromium screenshot in `pnpm shots`. |
| 2. Sign in with Plotwork | `apiBackend({ token })` once the API's OAuth is live, a `signIn()` helper that runs PKCE in a pop-up, and the SDK's `accessToken` option. |
| 3. Richer editing | `/rich`: highlighting from a small tokenizer of the shared language (keywords, strings, arrows, comments), completion of node ids and kinds from the last valid outline, and folding. Built on the platform, still with no dependency. CodeMirror stays possible as a page's own choice through a `pane` slot. |
| 4. Fixes and outline | `fix` buttons applied as edits with undo, and an outline panel from `/v1/diagrams/outline`. |

## Open questions for the owner

| Question | Why it matters |
|---|---|
| Is the editor its own package, or `@plotwork.official/viewer/editor`? | Its own package keeps the viewer small and its release apart; a subpath shares the element code and one version. |
| Should Sign in with Plotwork calls be metered to the reader or to the page's organisation? | It decides whether a docs site can offer the editor to anonymous readers through a proxy only, or also through readers' own accounts. |
| Which scope does `publish` need with a token? | `diagrams:use` covers drawing; publishing writes to an account and probably wants `diagrams:publish`. |
| Will the API answer CORS for a token-bearing browser call? | Without it, Sign in with Plotwork needs a proxy anyway. |
| Is a richer pane worth its size, or is CodeMirror through a slot enough? | Phase 3 is the largest piece and the one most likely to grow. |
| Should the editor read a `.diagram` URL (`src`) as well as inline source? | It is easy, but a page that fetches a file often wants to save it back, which the editor does not do. |

## See also

| Page | Why |
|---|---|
| [Viewer reference](../packages/viewer/README.md) | The `<plotwork-diagram>` the editor shows its picture with |
| [Element](../packages/viewer/src/element/README.md) | How the viewer's element is built, which the editor follows |
| [API client](../packages/sdk/README.md) | The `validate` and `render` calls and their answers |
| [Picture contract](../spec/picture.md) | What a drawn picture carries |
| [Examples](../examples/README.md) | The playgrounds that draw through a server today |
