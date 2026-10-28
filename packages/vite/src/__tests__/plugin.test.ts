import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { build } from 'vite'

import { diagramModule, fingerprintOf, plotwork } from '../index.js'
import { DiagramError, findCli } from '../cli.js'

/* Tests run from the package's folder. */
const FAKE_CLI = { command: process.execPath, args: [resolve(process.cwd(), 'src/__tests__/fake-cli.mjs')] }

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** A small project: an entry that imports a diagram, and the diagram. */
function project(diagram: string): string {
  const root = mkdtempSync(join(tmpdir(), 'plotwork-vite-test-'))
  folders.push(root)
  writeFileSync(join(root, 'checkout.diagram'), diagram)
  writeFileSync(join(root, 'main.js'), "import svg, { fingerprint } from './checkout.diagram'\nexport { svg, fingerprint }\n")
  return root
}

/** The module a build made, loaded, so a test reads its exports rather than how the bundler printed them. */
async function bundle(root: string, options = {}): Promise<{ svg: string; fingerprint: string }> {
  const output = await build({
    root,
    logLevel: 'silent',
    configFile: false,
    plugins: [plotwork({ cli: FAKE_CLI, ...options })],
    build: { write: false, lib: { entry: join(root, 'main.js'), formats: ['es'], fileName: 'main' }, minify: false },
  })
  const result = Array.isArray(output) ? output[0] : output
  if (result === undefined || !('output' in result)) throw new Error('No build output')
  const chunk = result.output.find((each) => each.type === 'chunk')
  const code = chunk?.type === 'chunk' ? chunk.code : ''
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)) as { svg: string; fingerprint: string }
}

describe('the Plotwork Vite plugin', () => {
  it('turns a .diagram import into the SVG the command line drew, with its fingerprint', async () => {
    const module = await bundle(project('flow "Checkout"\n'))
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-scheme-asked="auto" data-source="yes"><title>Checkout</title></svg>'
    expect({ svg: module.svg, fingerprint: module.fingerprint }).toEqual({ svg, fingerprint: fingerprintOf(svg) })
  })

  it('passes the scheme and leaves the source out when asked', async () => {
    const { svg } = await bundle(project('flow "Checkout"\n'), { scheme: 'dark', embedSource: false })
    expect(svg).toContain('data-scheme-asked="dark"')
    expect(svg).toContain('data-source="no"')
  })

  it("fails the build with the command line's own message for a diagram with a mistake", async () => {
    await expect(bundle(project('flow "Checkout"\nBROKEN\n'))).rejects.toThrow(/Plotwork could not draw .*checkout\.diagram[\s\S]*E100[\s\S]*hint: Write one edge per line/)
  })

  it('runs the command line the project installed, or says how to install it', () => {
    const root = mkdtempSync(join(tmpdir(), 'plotwork-vite-empty-'))
    folders.push(root)
    /* A machine with the command line installed globally finds that one; any other is told how to install it. */
    try {
      expect(findCli(root).args[0]).toMatch(/@buun_group[\\/]plotwork[\\/]plotwork\.mjs$/)
    } catch (error) {
      expect(error).toBeInstanceOf(DiagramError)
      expect(String(error)).toMatch(/npm install --save-dev @buun_group\/plotwork/)
    }
  })

  it('writes a module whose fingerprint is the SHA-256 of the text, as the viewer computes it', () => {
    const svg = '<svg/>'
    expect(diagramModule(svg)).toBe(`export const fingerprint = "sha256-${createHash('sha256').update(svg).digest('hex')}"\nexport default "<svg/>"\n`)
  })
})
