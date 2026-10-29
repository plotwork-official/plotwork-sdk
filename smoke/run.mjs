#!/usr/bin/env node
/**
 * The npm smoke test: does what a customer does, against a real Plotwork deployment, with the packages as npm serves them.
 *
 * In a new folder outside this repository it installs `@plotwork.official/viewer`, `/vite` and `/sdk` from npm with React, Vite
 * and the Plotwork command line, then:
 *
 *   1. calls the API with the SDK: a wrong key refused, vocabulary, validate (a mistake is an answer), render, icon search
 *   2. builds a React app with Vite that imports a `.diagram` file through the plugin
 *   3. publishes version a of a diagram under the stable link `sdk-smoke`, and checks the CDN serves it with CORS and an ETag
 *   4. opens the built app in Chromium: the bundled diagram loads with the fingerprint the plugin gave it, and the live viewer loads
 *      the stable link
 *   5. publishes version b, and waits for the live viewer to swap it in by itself (`plotwork-change`)
 *
 *   node smoke/run.mjs --env preview
 *   node smoke/run.mjs --env production --version 0.1.1 --shots smoke-shots
 *
 * With `--shots <folder>` it saves what Chromium showed, as evidence: the app with version a, then after version b swapped in, in
 * light and in dark.
 *
 * Needs PLOTWORK_API_KEY: a personal key (an organisation key publishes into a private library, which has no public link). The
 * browser is Playwright's Chromium (`npx playwright-core install chromium` once); it drives the page and is not part of the app.
 */
import { execFile as execFileCb } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { chromium } from 'playwright-core'

const execFile = promisify(execFileCb)
const ROOT = join(import.meta.dirname, '..')
const API = { preview: 'https://api-preview.plotwork.dev', production: 'https://api.plotwork.dev' }
/** The versions of the app's own dependencies: what a customer would have, pinned so a release of theirs cannot fail this test. */
const APP_DEPENDENCIES = { react: '19.3.0', 'react-dom': '19.3.0' }
const APP_DEV_DEPENDENCIES = { vite: '6.4.3', '@buun_group/plotwork': 'latest' }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }

const { values: args } = parseArgs({
  options: {
    env: { type: 'string', default: 'preview' },
    'base-url': { type: 'string' },
    version: { type: 'string', default: 'latest' },
    viewer: { type: 'string' },
    vite: { type: 'string' },
    sdk: { type: 'string' },
    keep: { type: 'boolean', default: false },
    shots: { type: 'string' },
  },
})
const baseUrl = args['base-url'] ?? API[args.env]
if (baseUrl === undefined) throw new Error(`--env is preview or production, or give --base-url`)
const apiKey = process.env.PLOTWORK_API_KEY
if (!apiKey) throw new Error('PLOTWORK_API_KEY is required: a personal key of the smoke test account')

const versions = { viewer: args.viewer ?? args.version, vite: args.vite ?? args.version, sdk: args.sdk ?? args.version }
const env = { ...process.env, PLOTWORK_BASE_URL: baseUrl, PLOTWORK_API_KEY: apiKey }
const results = []

function say(line) {
  process.stdout.write(`${line}\n`)
}

/** Runs one named step, records it, and stops the test at the first failure. */
async function step(name, run) {
  const started = Date.now()
  try {
    const value = await run()
    results.push({ name, ok: true, ms: Date.now() - started })
    say(`PASS ${name}`)
    return value
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started })
    say(`FAIL ${name}\n${error instanceof Error ? (error.stderr || error.stdout || error.message) : String(error)}`)
    throw error
  }
}

function fingerprintOf(text) {
  return `sha256-${createHash('sha256').update(text, 'utf8').digest('hex')}`
}

async function until(what, timeoutMs, check) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs / 1000} s waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
}

async function run(command, commandArgs, cwd) {
  return execFile(command, commandArgs, { cwd, env, maxBuffer: 32 * 1024 * 1024 })
}

async function install(app) {
  const pkg = {
    name: 'plotwork-smoke-app',
    private: true,
    type: 'module',
    dependencies: {
      '@plotwork.official/viewer': versions.viewer,
      '@plotwork.official/sdk': versions.sdk,
      ...APP_DEPENDENCIES,
    },
    devDependencies: { '@plotwork.official/vite': versions.vite, ...APP_DEV_DEPENDENCIES },
  }
  await writeFile(join(app, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  // A version published a minute ago can take a moment to be served everywhere, so a failed install is tried again.
  for (let attempt = 1; ; attempt += 1) {
    try {
      await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], app)
      break
    } catch (error) {
      if (attempt === 5) throw error
      say(`  install failed, trying again in 30 s (${attempt}/5)`)
      await new Promise((resolve) => setTimeout(resolve, 30_000))
    }
  }
  const installed = {}
  for (const name of ['viewer', 'vite', 'sdk']) {
    installed[name] = JSON.parse(await readFile(join(app, 'node_modules', '@plotwork.official', name, 'package.json'), 'utf8')).version
  }
  say(`  installed viewer ${installed.viewer}, vite ${installed.vite}, sdk ${installed.sdk}`)
  return installed
}

async function publish(app, version) {
  const { stdout } = await run('node', ['api.mjs', 'publish', version], app)
  const answer = JSON.parse(stdout.trim().split('\n').at(-1))
  const picture = await fetch(answer.url, { cache: 'no-store' })
  if (!picture.ok) throw new Error(`The published picture answered ${picture.status}`)
  return { ...answer, fingerprint: fingerprintOf(await picture.text()) }
}

/** Waits for the stable link to serve `fingerprint`, then checks what a viewer on another site relies on. */
async function checkStableLink(stableUrl, fingerprint) {
  const response = await until(`the stable link to show ${fingerprint.slice(0, 19)}`, 150_000, async () => {
    const answer = await fetch(`${stableUrl}?smoke=${Date.now()}`, { cache: 'no-store' })
    return answer.ok && fingerprintOf(await answer.clone().text()) === fingerprint ? answer : null
  })
  const type = response.headers.get('content-type') ?? ''
  if (!type.startsWith('image/svg+xml')) throw new Error(`content-type is ${type}`)
  if (response.headers.get('access-control-allow-origin') !== '*') throw new Error('No access-control-allow-origin: *, so a viewer on another site cannot read it')
  const etag = response.headers.get('etag')
  if (etag === null) throw new Error('No ETag, so every live check downloads the whole picture')
  const again = await fetch(stableUrl, { headers: { 'if-none-match': etag }, cache: 'no-store' })
  if (again.status !== 304) throw new Error(`A check with the current ETag answered ${again.status}, not 304`)
}

/** Saves the page in light and dark as `<folder>/<env>-<name>-<scheme>.png`, when `--shots` asks for it. */
async function shoot(page, name) {
  if (args.shots === undefined) return
  const folder = resolve(args.shots)
  await mkdir(folder, { recursive: true })
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(folder, `${args.env}-${name}-${scheme}.png`), fullPage: true })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

function serve(folder) {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    const path = normalize(join(folder, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)))
    if (!path.startsWith(folder + sep)) return response.writeHead(403).end()
    try {
      response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(await readFile(path))
    } catch {
      response.writeHead(404).end()
    }
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

const app = await mkdtemp(join(tmpdir(), 'plotwork-smoke-'))
let browser
let server
say(`Plotwork SDK smoke test against ${baseUrl}, in ${app}`)
try {
  await cp(join(ROOT, 'smoke', 'app'), app, { recursive: true })
  await cp(join(ROOT, 'spec', 'fixtures', 'checkout.diagram'), join(app, 'src', 'checkout.diagram'))

  await step('install the packages from npm', () => install(app))

  await step('call the API with @plotwork.official/sdk', async () => {
    const { stdout } = await run('node', ['api.mjs', 'checks'], app)
    for (const line of stdout.trim().split('\n')) say(`  ${line}`)
  })

  await step('build a React app that imports a .diagram file with @plotwork.official/vite', async () => {
    await run('npx', ['vite', 'build', '--logLevel', 'warn'], app)
    const assets = join(app, 'dist', 'assets')
    const scripts = (await readdir(assets)).filter((file) => file.endsWith('.js'))
    const bundle = (await Promise.all(scripts.map((file) => readFile(join(assets, file), 'utf8')))).join('\n')
    if (!bundle.includes('data-node') || !/sha256-[0-9a-f]{64}/.test(bundle)) throw new Error('The bundle has no drawn diagram and fingerprint')
  })

  const a = await step('publish version a under the stable link sdk-smoke', () => publish(app, 'a'))
  await step('the CDN serves the stable link with CORS, an ETag and 304', () => checkStableLink(a.stableUrl, a.fingerprint))

  server = await serve(join(app, 'dist'))
  const address = server.address()
  const origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const problems = []
  page.on('pageerror', (error) => problems.push(error.message))
  page.on('console', (message) => message.type() === 'error' && problems.push(message.text()))
  const events = () => page.evaluate(() => window.smoke?.events ?? [])

  await step('the viewer shows the bundled diagram and the live stable link', async () => {
    await page.goto(`${origin}/?live=${encodeURIComponent(a.stableUrl)}`)
    const bundled = await page.evaluate(() => window.smoke.bundled)
    await until('both viewers to load', 60_000, async () => {
      const seen = await events()
      const failed = seen.find((event) => event.name === 'error')
      if (failed !== undefined) throw new Error(`The viewer reported an error: ${JSON.stringify(failed)}`)
      return seen.some((event) => event.id === 'bundled' && event.name === 'load' && event.fingerprint === bundled) && seen.some((event) => event.id === 'live' && event.name === 'load' && event.fingerprint === a.fingerprint)
    })
    const pictures = await page.locator('plotwork-diagram').evaluateAll((elements) => elements.map((element) => element.shadowRoot?.querySelector('img')?.naturalWidth ?? 0))
    if (pictures.length !== 2 || pictures.some((width) => width === 0)) throw new Error(`The viewers show no picture: ${JSON.stringify(pictures)}`)
    await shoot(page, '1-version-a')
  })

  const b = await step('publish version b to the same stable link', () => publish(app, 'b'))

  await step('the live viewer swaps in version b by itself', async () => {
    await until('plotwork-change with version b', 240_000, async () => (await events()).some((event) => event.id === 'live' && event.name === 'change' && event.fingerprint === b.fingerprint))
    await shoot(page, '2-version-b-live')
  })

  if (problems.length > 0) await step('the page logs no errors', () => Promise.reject(new Error(problems.join('\n'))))
} catch {
  process.exitCode = 1
} finally {
  await browser?.close()
  server?.close()
  if (!args.keep) await rm(app, { recursive: true, force: true })
  const passed = results.filter((result) => result.ok).length
  say(`\n${passed} of ${results.length} steps passed against ${baseUrl}`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = results.map((result) => `| ${result.ok ? 'pass' : 'FAIL'} | ${result.name} | ${(result.ms / 1000).toFixed(1)} s |`)
    await writeFile(process.env.GITHUB_STEP_SUMMARY, `### npm packages against ${baseUrl}\n\n| Result | Step | Time |\n|---|---|---|\n${rows.join('\n')}\n`, { flag: 'a' })
  }
}
