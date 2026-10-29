# Library

`<plotwork-library>`: a list of a signed-in person's diagrams from `GET /v1/library`, with a search box and a listbox to pick one, sent as `plotwork-select`. Published at `@plotwork.official/viewer/library`.

## Standards

Code here follows:

- [Security](../../../../.standards/docs/standards/core/security.md) - the person's token goes only to https or this computer, never with a cookie; a diagram's name and folder are text, and every node is made with `createElement`
- [Accessibility baseline](../../../../.standards/docs/standards/packs/ui-craft/accessibility-baseline.md) - a labelled search box, a listbox with `aria-activedescendant` and the arrows, Home, End, Enter and Space, a polite count of results
- [State coverage](../../../../.standards/docs/standards/packs/ui-craft/state-coverage.md) - loading, signed out, a missing scope, a failure with Try again, an empty library and a search with no match each have a shape

## Contents

| Path | Purpose |
|---|---|
| `plotwork-library.ts` | The element's class, made on first use (`createPlotworkLibraryClass`): the attributes, `token`, `fetch`, `labels`, `items`, `selected`, `reload()`, loading by page, the states and the events. |
| `listbox.ts` | `Listbox`: the options, the search filter (`matches`, every word in the name or folder, accents and case ignored), the active option and the keys. |
| `pages.ts` | `fetchLibraryPage`: one page of `/v1/library` with the token, read into `LibraryItem`s; `pictureUrlOf`; `LibraryLoadError`. |
| `copy.ts` | Every word the element shows or says, and `mergeLibraryLabels`. |
| `styles.ts` | The style sheet: `--plotwork-*` custom properties, `::part`, light and dark. |
| `define.ts` | `definePlotworkLibrary()`: registers the tag once, and does nothing where there is no `customElements`. |
| `register.ts` | The side-effect entry, `@plotwork.official/viewer/library/register`. |
| `index.ts` | The subpath's exports. |
