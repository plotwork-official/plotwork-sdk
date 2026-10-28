import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/**
 * Drawing a `.diagram` file with the Plotwork command line the project installed. The plugin carries no engine: it runs the
 * command line's `render`, which draws offline and fetches nothing, and reads the SVG it wrote. A diagram with a mistake is a
 * `DiagramError` carrying the command line's own message (line, column and hint), which Vite shows in its overlay.
 */

/** The npm package of the command line, and its program inside the package. */
export const CLI_PACKAGE = '@buun_group/plotwork'

/** How long one drawing may take before it counts as failed, in milliseconds. */
const RENDER_TIMEOUT_MS = 60_000

/** The most output of the command line kept for a message. */
const MAX_BUFFER = 8 * 1024 * 1024

export class DiagramError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiagramError'
  }
}

/** What `render` is asked for. */
export interface RenderOptions {
  scheme: 'auto' | 'light' | 'dark'
  /** The colour theme, or undefined for the one in the diagram's header. */
  theme?: string | undefined
  /** Keep the source inside the SVG, so the viewer's `source()` gives it back. */
  embedSource: boolean
}

/** The program to run: `node` and the command line's file, found from the project's root. */
export interface Program {
  command: string
  args: string[]
}

/** Finds the installed command line from `root`, or says how to install it. */
export function findCli(root: string): Program {
  const require = createRequire(join(root, 'package.json'))
  let manifestPath: string
  try {
    manifestPath = require.resolve(`${CLI_PACKAGE}/package.json`)
  } catch {
    throw new DiagramError(`The Plotwork command line is not installed. Add it as a development dependency: npm install --save-dev ${CLI_PACKAGE}`)
  }
  return { command: process.execPath, args: [resolve(dirname(manifestPath), 'plotwork.mjs')] }
}

function run(program: Program, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    execFile(program.command, [...program.args, ...args], { cwd, timeout: RENDER_TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1
      done({ code, stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

/** Draws one `.diagram` file to SVG text. */
export async function renderDiagram(program: Program, file: string, options: RenderOptions, cwd: string): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'plotwork-vite-'))
  const out = join(folder, 'diagram.svg')
  const args = ['render', file, '--out', out, '--scheme', options.scheme]
  if (options.theme !== undefined) args.push('--theme', options.theme)
  if (!options.embedSource) args.push('--no-embed-source')
  try {
    const result = await run(program, args, cwd)
    if (result.code !== 0) {
      const said = (result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`).replaceAll(out, '<out>')
      throw new DiagramError(said)
    }
    return await readFile(out, 'utf8')
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}
