#!/usr/bin/env node
/**
 * Draws the screenshots of the example apps for the READMEs. For each example it copies the folder to a new temporary one, installs
 * it from npm as a reader would, builds it, serves the build (`next start`, `vite preview`), opens it in Chromium in light and in
 * dark, waits for every diagram on the page, and writes `docs/assets/examples/<name>-<scheme>.png` at twice the pixel density. It
 * fails on any error the page logs, so a broken example never makes a picture.
 *
 *   pnpm shots:examples
 *   pnpm shots:examples --only nextjs
 *
 * PLOTWORK_API_KEY, PLOTWORK_BASE_URL and the stable link variables are passed to each app as they are. Without a key the
 * playground shows how to add one, and only what needs no key is drawn. It needs a Chromium that Playwright can launch
 * (`npx playwright-core install chromium` once). Not shipped; nothing imports it.
 */
import { spawn, execFile as execFileCb } from 'node:child_process'
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { chromium } from 'playwright-core'

const execFile = promisify(execFileCb)
const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'docs', 'assets', 'examples')
/** Left out of the copy: what an install or a build writes, and a local key. */
const SKIP = new Set(['node_modules', '.next', 'dist', '.env.local'])

const EXAMPLES = {
  nextjs: { serve: (port) => ['npx', ['next', 'start', '--port', String(port), '--hostname', '127.0.0.1']] },
  'react-vite': { serve: (port) => ['npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1']] },
}

const { values: args } = parseArgs({ options: { only: { type: 'string' } } })
const names = args.only === undefined ? Object.keys(EXAMPLES) : [args.only]
for (const name of names) if (!(name in EXAMPLES)) throw new Error(`No example ${name}; use ${Object.keys(EXAMPLES).join(' or ')}`)
const hasKey = Boolean(process.env.PLOTWORK_API_KEY)

function say(line) {
  process.stdout.write(`${line}\n`)
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => resolve(typeof address === 'object' && address !== null ? address.port : 0))
    })
  })
}

async function untilUp(origin, server) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`The server stopped with code ${server.exitCode}`)
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`${origin} did not answer in 60 s`)
}

/** Stops the server and everything it started, by its process group. */
function stop(server) {
  if (server.exitCode !== null || server.pid === undefined) return
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    // Already gone.
  }
}

async function shoot(browser, name, origin) {
  const problems = []
  for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage({ colorScheme: scheme, viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })
    page.on('pageerror', (error) => problems.push(`${scheme}: ${error.message}`))
    page.on('console', (message) => message.type() === 'error' && problems.push(`${scheme}: ${message.text()}`))
    await page.goto(origin)
    // Every viewer with a picture has a fingerprint; the playground's has one only once the API drew it.
    await page.waitForFunction(
      (expectDrawn) => {
        const viewers = [...document.querySelectorAll('plotwork-diagram')]
        const shown = viewers.filter((element) => element.fingerprint)
        const notice = document.querySelector('.notice')
        // A call still in flight leaves the Draw button disabled.
        if (document.querySelector('button[type="submit"]:disabled') !== null) return false
        return expectDrawn ? viewers.length > 0 && shown.length === viewers.length : shown.length > 0 || notice !== null
      },
      hasKey,
      { timeout: 60_000 },
    )
    await page.waitForTimeout(400)
    const file = join(OUT, `${name}-${scheme}.png`)
    await page.screenshot({ path: file, fullPage: true })
    say(`wrote ${file.slice(ROOT.length + 1)}`)
    await page.close()
  }
  // A refused call without a key logs a 401 in the console; that is the page working as meant.
  const real = hasKey ? problems : problems.filter((line) => !/status of 40[01]/.test(line))
  if (real.length > 0) throw new Error(`${name} logged errors:\n${real.map((line) => `  ${line}`).join('\n')}`)
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
try {
  for (const name of names) {
    const folder = await mkdtemp(join(tmpdir(), `plotwork-example-${name}-`))
    let server
    try {
      await cp(join(ROOT, 'examples', name), folder, { recursive: true, filter: (path) => !SKIP.has(path.split(/[\\/]/).at(-1)) })
      say(`${name}: install from npm`)
      await execFile('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: folder, maxBuffer: 32 * 1024 * 1024 })
      say(`${name}: build`)
      await execFile('npm', ['run', 'build'], { cwd: folder, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, maxBuffer: 32 * 1024 * 1024 })
      const port = await freePort()
      const [command, commandArgs] = EXAMPLES[name].serve(port)
      server = spawn(command, commandArgs, { cwd: folder, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, detached: true, stdio: 'ignore' })
      const origin = `http://127.0.0.1:${port}`
      await untilUp(origin, server)
      say(`${name}: serving on ${origin}${hasKey ? '' : ', with no PLOTWORK_API_KEY'}`)
      await shoot(browser, name, origin)
    } finally {
      if (server !== undefined) stop(server)
      await rm(folder, { recursive: true, force: true })
    }
  }
} finally {
  await browser.close()
}
