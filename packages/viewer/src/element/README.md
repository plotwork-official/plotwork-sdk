# Element

`<plotwork-diagram>`: a custom element with a shadow root that shows a Plotwork picture on a canvas you can move and zoom, traces a box's lines, and tells the page when a box that opens a part is pressed. It is the portal's `DiagramViewer` without React, so it works in any page.

## Standards

Code here follows:

- [Security](../../../../.standards/docs/standards/core/security.md) - the picture is an `img` from a `blob:` address, which runs no script; every node of the element's own is made with `createElement`, never from HTML text
- [Accessibility baseline](../../../../.standards/docs/standards/packs/ui-craft/accessibility-baseline.md) - the canvas is one tab stop with a name, every button has a name, a trace and an update are said in a polite live region, reduced motion is honoured
- [State coverage](../../../../.standards/docs/standards/packs/ui-craft/state-coverage.md) - loading, a picture that cannot be shown (with the reason), and an element with nothing to show each have a shape

## Contents

| Path | Purpose |
|---|---|
| `plotwork-diagram.ts` | The element's class, made on first use (`createPlotworkDiagramClass`) so importing the package on a server is safe. Attributes, the `svg` and `labels` properties, `fit()`, `zoomIn()`, `zoomOut()`, `reload()`, `source()`, loading and pinning, live updates, and the wiring of the shell, the gestures and the events. |
| `picture-canvas.ts` | `PictureCanvas`: the view of the picture on its canvas (fit, zoom, resize), the box traced and its overlay, and what a hover or a press means (trace or drill). |
| `loading.ts` | `fetchPictureText`, the text at `src`, and `readPicture`, its fingerprint checked against a pin and its boxes and lines read. A mistake is a `PictureLoadError`. |
| `chrome.ts` | What surrounds the picture: its `img` from a `blob:` address (`PictureImage`), the paper, the canvas's name, the toolbar's words, full screen, the wheel hint. |
| `define.ts` | `definePlotworkDiagram()`: registers the tag once, and does nothing where there is no `customElements`. |
| `shell.ts` | The shadow tree, built once: stage, canvas, picture, toolbar, notice, wheel hint, live region. |
| `gestures.ts` | The wheel, a drag, a pinch, a double press and the keys, wired to the canvas. A press that did not move counts as a press. |
| `trace-layer.ts` | The traced box's lines in an SVG of the element's own over the picture (the portal's `TraceOverlay`), and `place`, which moves the picture and the overlay with the view. |
| `events.ts` | The events and their details: `plotwork-load`, `plotwork-change`, `plotwork-error`, `plotwork-drill`, `plotwork-trace`. |
| `copy.ts` | Every word the element shows or says, and `mergeLabels` for a page in another language. |
| `styles.ts` | The style sheet, themed through `--plotwork-*` custom properties and styled through `part`. |
| `dom.ts` | `html`, `svg` and `icon`: nodes from tag names and attributes, never from markup. |
