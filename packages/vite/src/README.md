# Vite plugin source

The plugin that turns a `.diagram` import into the SVG the Plotwork command line draws.

## Standards

Code here follows:

- [Dependencies](../../../.standards/docs/standards/core/dependencies.md) - no engine and no package is bundled; the project's own command line draws
- [Security](../../../.standards/docs/standards/core/security.md) - the command line is run with `execFile` and an argument list, never through a shell

## Contents

| Path | Purpose |
|---|---|
| `index.ts` | `plotwork()`, the Vite plugin: loads each `.diagram` module as its SVG text and fingerprint, and reports a mistake through Vite's overlay. |
| `cli.ts` | Finds the installed command line and runs its `render` into a temporary folder; `DiagramError` carries its message. |
