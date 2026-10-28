# Spec

What every Plotwork SDK, in any language, is built against: the picture contract and pictures the engine drew. A package in another language reads the same fixtures in its tests, so the readers cannot drift apart.

## TL;DR

| Question | Answer |
|---|---|
| What is the contract? | [`picture.md`](./picture.md): the marks a viewer reads, the source, the addresses, fingerprints, live updates. |
| What is the API? | [`openapi.json`](./openapi.json): the public `/v1` operations of the Plotwork API, copied from the API by `pnpm sync:openapi`. Each language's client is generated from it. |
| Where are the fixtures? | `fixtures/`: a `.diagram` source and the SVGs the engine drew from it. |
| Who draws them? | The Plotwork command line. They are never edited by hand. |

## Fixtures

| File | What it is |
|---|---|
| `fixtures/checkout.diagram` | A flow with four boxes, three labelled lines, and a box that opens part 2. |
| `fixtures/checkout.svg` | Drawn with `--scheme auto`: both schemes in one picture, with its source. |
| `fixtures/checkout.dark.svg` | Drawn with `--scheme dark --no-embed-source`: dark only, no source. |

To draw them again after a renderer change:

```bash
npx @buun_group/plotwork render spec/fixtures/checkout.diagram --scheme auto --out spec/fixtures/checkout.svg
npx @buun_group/plotwork render spec/fixtures/checkout.diagram --scheme dark --no-embed-source --out spec/fixtures/checkout.dark.svg
```

## See also

| Page | Why |
|---|---|
| [Picture contract](./picture.md) | What a viewer reads |
| [Repository README](../README.md) | The packages built on it |
