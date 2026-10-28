# The Plotwork picture contract

What a viewer in any language may rely on in an SVG the Plotwork engine drew, and how a picture is fetched, pinned, and watched for a new version. The JavaScript viewer reads exactly this; a viewer in another language reads the same.

## TL;DR

| Question | Answer |
|---|---|
| What is a picture? | An SVG whose root has a `viewBox`. The engine paints no background. |
| Where are its boxes? | Groups with `data-node` (or `data-state-id`), each with the shape it paints first. |
| Where are its lines? | Groups with `data-edge`, `data-link`, `data-transition` or `data-flow`, naming their ends in `data-from` and `data-to`. |
| Which box opens a part? | One with `data-part`, a whole number from 1. |
| Where is its source? | In `<metadata data-format="buun-diagram">` on the root, when it was saved with it. |
| How is a scheme forced? | `data-scheme="light"` or `"dark"` on the root of a picture with `data-theme="auto"`. |
| What is its fingerprint? | `sha256-` and the SHA-256 of its text in UTF-8, as lower-case hex. |
| How is a new version seen? | Revalidate the address: an unchanged picture answers 304. |

## Boxes and lines

| Mark | Where | Meaning |
|---|---|---|
| `data-node="<id>"` | a group | A box. Its first `rect`, `circle`, `ellipse`, `polygon` or `path` is where it is; `rx` is its corner radius. Its first `text` is its name. |
| `data-state-id="<id>"` | a group | A state's mark (start, end, choice); `data-state-marker` names its kind. |
| `data-part="<n>"` | a box | The box is drawn in full in part `n` of the same series. Anything but `1` to `999` is ignored. |
| `data-edge`, `data-link`, `data-transition`, `data-flow` | a group or path | A line; the value is its id. `data-from` and `data-to` name the boxes at its ends. |
| `data-link="a>b"` | a Gantt link | The ends are in the id, before and after `>`. |
| `data-link-from`, `data-link-to` | a mind map ribbon | Topic numbers; the box is `t<number>`. |
| `data-edge-label="<line id>"` | a group | The label of that line. |

A position is the shape's own coordinates plus every `translate(x y)` above it. A `scale` or `rotate` above a shape means the shape is left out. Path data a viewer draws again must match `^[MmLlHhVvCcSsQqTtAaZz0-9 ,.-]+$`; anything else is left out.

A kind that marks no ends (a sequence's messages, a class or table relation, a git graph) has nothing to trace.

## Source

| Attribute of the `metadata` element | Meaning |
|---|---|
| `data-format="buun-diagram"` | It holds the source. |
| `data-encoding="text"` (or absent) | The text is the source with `&amp;`, `&lt;`, `&gt;` and `&#13;` escaped. |
| `data-encoding="json"` | The text is a JSON string, for a source with characters XML cannot hold. |

An organisation embed link serves the picture with the source removed.

## Addresses

| Address | What it is | Cache | CORS |
|---|---|---|---|
| `https://cdn.plotwork.dev/d/<token>.svg` | A published picture. Never changes. | `public, max-age=3600` | `*` |
| `https://cdn.plotwork.dev/l/<token>.svg` | A stable link: the latest picture of a named diagram. | `public, max-age=60` | `*` |
| `https://cdn.plotwork.dev/o/<token>.svg` | An organisation embed link: shown only to pages on the sites the owner allows; any other page gets a placeholder. | `private, max-age=60`, strong `ETag` of the fingerprint | `*` |

A viewer fetches with no credentials and `Accept: image/svg+xml`, and refuses an answer larger than 3 MiB.

## Live updates

A live viewer revalidates its address on an interval (60 seconds by default, never below 15), and only while its page is in view. With `fetch`, `cache: 'no-cache'` makes the browser send the tag it holds; an unchanged picture answers 304 and costs no download. The viewer compares fingerprints and swaps the picture when it differs.

A viewer pinned to a fingerprint shows the picture only when it matches, and never watches.

## See also

| Page | Why |
|---|---|
| [Fixtures](./README.md) | Pictures drawn by the engine, for tests in every language |
| [Viewer package](../packages/viewer/README.md) | The JavaScript reader of this contract |
