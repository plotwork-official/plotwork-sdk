/**
 * The style sheet of `<plotwork-library>`, inside its shadow root. A page themes it through the custom properties on `:host`
 * (`--plotwork-paper`, `--plotwork-ink`, `--plotwork-accent`, `--plotwork-control`, `--plotwork-radius`, `--plotwork-font`,
 * `--plotwork-height`) and styles the parts named with `part` (`stage`, `search`, `list`, `option`, `badge`, `notice`, `button`).
 * It follows the page's colour scheme, or `theme="light"` or `theme="dark"`.
 */
const DARK = `
  --plotwork-paper: #171716;
  --plotwork-ink: #c3c2b7;
  --plotwork-accent: #2dd4bf;
  --plotwork-control: #262624;
`

export const LIBRARY_CSS = `
:host {
  --plotwork-paper: #f4f4f1;
  --plotwork-ink: #52514e;
  --plotwork-accent: #0f766e;
  --plotwork-control: #ffffff;
  --plotwork-border: color-mix(in srgb, var(--plotwork-ink) 18%, transparent);
  --plotwork-radius: 10px;
  --plotwork-font: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --plotwork-height: 360px;
  display: block;
  position: relative;
  block-size: var(--plotwork-height);
  min-block-size: 160px;
  color-scheme: light dark;
  font-family: var(--plotwork-font);
  color: var(--plotwork-ink);
}
@media (prefers-color-scheme: dark) {
  :host(:not([theme='light'])) {${DARK}}
}
:host([theme='dark']) {${DARK}  color-scheme: dark;
}
:host([theme='light']) { color-scheme: light; }
:host([hidden]) { display: none; }
.stage {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  block-size: 100%;
  padding: 8px;
  border: 1px solid var(--plotwork-border);
  border-radius: var(--plotwork-radius);
  background: var(--plotwork-paper);
}
.search {
  box-sizing: border-box;
  inline-size: 100%;
  padding: 8px 12px;
  border: 1px solid var(--plotwork-border);
  border-radius: calc(var(--plotwork-radius) - 4px);
  background: var(--plotwork-control);
  color: inherit;
  font: inherit;
  font-size: 14px;
}
.search:focus-visible, .list:focus-visible, button:focus-visible { outline: 2px solid var(--plotwork-accent); outline-offset: 1px; }
.list {
  flex: 1;
  min-block-size: 0;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
  border-radius: calc(var(--plotwork-radius) - 4px);
}
.list[hidden] { display: none; }
.list [role='option'] {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 8px;
  padding: 8px 10px;
  border-radius: calc(var(--plotwork-radius) - 4px);
  border-inline-start: 3px solid transparent;
  cursor: pointer;
}
.list [role='option'][hidden] { display: none; }
.list [role='option']:hover { background: color-mix(in srgb, var(--plotwork-ink) 8%, transparent); }
.list:focus-visible [data-active] { box-shadow: inset 0 0 0 2px var(--plotwork-accent); }
.list [aria-selected='true'] {
  border-inline-start-color: var(--plotwork-accent);
  background: color-mix(in srgb, var(--plotwork-accent) 14%, transparent);
}
.name { grid-column: 1; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.meta { grid-column: 1; font-size: 12px; opacity: 0.8; overflow-wrap: anywhere; }
.badge {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  padding: 2px 8px;
  border: 1px solid var(--plotwork-border);
  border-radius: 999px;
  font-size: 11px;
}
.notice { margin: auto; max-inline-size: 36ch; text-align: center; font-size: 14px; }
.notice[hidden], button[hidden], .search[hidden] { display: none; }
button {
  align-self: center;
  padding: 6px 14px;
  border: 1px solid var(--plotwork-border);
  border-radius: 999px;
  background: var(--plotwork-control);
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
button:hover { background: color-mix(in srgb, var(--plotwork-ink) 8%, var(--plotwork-control)); }
.live {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`
