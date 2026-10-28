import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

import { DiagramError, findCli, renderDiagram } from './cli.js'
import type { Program, RenderOptions } from './cli.js'

/**
 * `@plotwork.official/vite`: `import checkout from './checkout.diagram'` gives the picture the Plotwork engine draws from that file,
 * as SVG text, at build time. Nothing of the engine reaches the browser. In development the file is watched, so saving it draws it
 * again and the module updates; `<plotwork-diagram>` given the new text shows it as a new version, keeping the reader's view.
 *
 *   import { plotwork } from '@plotwork.official/vite'
 *   export default defineConfig({ plugins: [plotwork()] })
 */

export interface PlotworkPluginOptions {
  /** The colour scheme to draw in. `auto` (the default) draws one picture that follows the reader's light or dark setting. */
  scheme?: 'auto' | 'light' | 'dark'
  /** The colour theme (`plotwork`, `slate`, `ocean`, ...), over the diagram header's `theme=`. */
  theme?: string
  /** Keep the source inside the SVG, so the viewer's `source()` gives it back. On by default. */
  embedSource?: boolean
  /** Which files are diagrams. `.diagram` by default. */
  include?: RegExp
  /** The command line to run instead of the installed `@buun_group/plotwork`, as a program and its first arguments. */
  cli?: { command: string; args?: string[] }
}

/** The fingerprint the viewer computes and pins: `sha256-` and the SHA-256 of the text in UTF-8, as lower-case hex. */
export function fingerprintOf(svg: string): string {
  return `sha256-${createHash('sha256').update(svg, 'utf8').digest('hex')}`
}

/** The module a diagram becomes: the SVG text as the default export, and its fingerprint. */
export function diagramModule(svg: string): string {
  return `export const fingerprint = ${JSON.stringify(fingerprintOf(svg))}\nexport default ${JSON.stringify(svg)}\n`
}

/** The id of a module without its query, so `./a.diagram?import` is still a diagram. */
function fileOf(id: string): string {
  const query = id.indexOf('?')
  return query === -1 ? id : id.slice(0, query)
}

export function plotwork(options: PlotworkPluginOptions = {}): Plugin {
  const include = options.include ?? /\.diagram$/
  const render: RenderOptions = { scheme: options.scheme ?? 'auto', theme: options.theme, embedSource: options.embedSource ?? true }
  let root = process.cwd()
  let program: Program | null = options.cli === undefined ? null : { command: options.cli.command, args: options.cli.args ?? [] }

  return {
    name: 'plotwork',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
    },
    async load(id) {
      const file = fileOf(id)
      if (!include.test(file) || id.includes('?raw') || id.includes('?url')) return null
      program ??= findCli(root)
      try {
        const svg = await renderDiagram(program, file, render, root)
        return { code: diagramModule(svg), map: null }
      } catch (error) {
        if (error instanceof DiagramError) this.error(`Plotwork could not draw ${file}:\n${error.message}`)
        throw error
      }
    },
  }
}

export default plotwork
export { DiagramError } from './cli.js'
