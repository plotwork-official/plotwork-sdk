/**
 * The element's style sheet, inside its shadow root, so a page's CSS never reaches in and the element's never leaks out. A page
 * themes it through the custom properties on `:host` (`--plotwork-paper`, `--plotwork-ink`, `--plotwork-trace`, `--plotwork-radius`,
 * `--plotwork-font`, `--plotwork-height`) and styles the parts named with `part` (`stage`, `canvas`, `toolbar`, `button`, `notice`).
 */
export const VIEWER_CSS = `
:host {
  --plotwork-paper: #f4f4f1;
  --plotwork-ink: #52514e;
  --plotwork-trace: #0f766e;
  --plotwork-control: #ffffff;
  --plotwork-border: color-mix(in srgb, var(--plotwork-ink) 18%, transparent);
  --plotwork-dot: color-mix(in srgb, var(--plotwork-ink) 22%, transparent);
  --plotwork-radius: 10px;
  --plotwork-font: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --plotwork-height: 480px;
  display: block;
  position: relative;
  block-size: var(--plotwork-height);
  min-block-size: 200px;
  color-scheme: light dark;
  font-family: var(--plotwork-font);
  color: var(--plotwork-ink);
}
:host([hidden]) { display: none; }
:host([theme='light']) { color-scheme: light; }
:host([theme='dark']) { color-scheme: dark; }
:host([data-paper='dark']) {
  --plotwork-paper: #171716;
  --plotwork-ink: #c3c2b7;
  --plotwork-trace: #2dd4bf;
  --plotwork-control: #262624;
  --plotwork-dot: color-mix(in srgb, var(--plotwork-ink) 16%, transparent);
}
.stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border: 1px solid var(--plotwork-border);
  border-radius: var(--plotwork-radius);
  background: var(--plotwork-paper);
}
.canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  background-image: radial-gradient(circle, var(--plotwork-dot) 0.9px, transparent 1.4px);
  outline: none;
}
.canvas:focus-visible { box-shadow: inset 0 0 0 2px var(--plotwork-trace); border-radius: var(--plotwork-radius); }
.canvas[data-dragging] { cursor: grabbing; }
.canvas[data-drill] { cursor: pointer; }
.picture, .trace {
  position: absolute;
  inset: 0 auto auto 0;
  display: block;
  max-inline-size: none;
  transform-origin: 0 0;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}
.trace { overflow: visible; }
.trace .veil { fill: color-mix(in srgb, var(--plotwork-paper) 62%, transparent); }
.trace .halo, .trace .stroke, .trace .ribbon, .trace .end, .trace .label, .trace .chosen {
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.trace .halo { fill: none; stroke: var(--plotwork-paper); stroke-width: 6; }
.trace .stroke { fill: none; stroke: var(--plotwork-trace); stroke-width: 2.5; }
.trace .ribbon { fill: color-mix(in srgb, var(--plotwork-trace) 30%, transparent); stroke: var(--plotwork-trace); stroke-width: 1.5; }
.trace .end, .trace .label { fill: none; stroke: var(--plotwork-trace); stroke-width: 1.5; }
.trace .chosen { fill: none; stroke: var(--plotwork-trace); stroke-width: 3; }
.toolbar {
  position: absolute;
  inset: auto 12px 12px auto;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--plotwork-border);
  border-radius: 999px;
  background: var(--plotwork-control);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
}
:host([controls='none']) .toolbar { display: none; }
.toolbar button {
  display: inline-grid;
  place-items: center;
  inline-size: 32px;
  block-size: 32px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.toolbar button:hover { background: color-mix(in srgb, var(--plotwork-ink) 10%, transparent); }
.toolbar button:focus-visible { outline: 2px solid var(--plotwork-trace); outline-offset: 1px; }
.toolbar svg path { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.toolbar output { min-inline-size: 3.5em; font-size: 12px; font-variant-numeric: tabular-nums; text-align: center; }
.notice, .hint {
  position: absolute;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  max-inline-size: min(36ch, 90%);
  text-align: center;
  font-size: 14px;
}
.hint {
  padding: 6px 12px;
  border-radius: 999px;
  background: rgb(23 23 22 / 0.86);
  color: #f4f4f1;
  pointer-events: none;
  opacity: 0;
}
.hint[data-shown] { opacity: 1; }
.notice[hidden], .hint[hidden], .toolbar[hidden] { display: none; }
.live {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (prefers-reduced-motion: no-preference) {
  .picture[data-glide], .trace[data-glide] { transition: transform 160ms ease-out, width 160ms ease-out, height 160ms ease-out; }
  .hint { transition: opacity 200ms ease-out; }
}
`
