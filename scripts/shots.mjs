#!/usr/bin/env node
/**
 * Draws the README's screenshots of the viewer from the real component: it serves the repository, opens the vanilla example in
 * Chromium in light and in dark, points at the Orders API box so its lines are traced, and writes `docs/assets/viewer-<scheme>.png`
 * at twice the pixel density. It fails on any error the page logs, so a broken build never makes a picture.
 *
 *   pnpm shots
 *
 * It needs a Chromium that Playwright can launch (`npx playwright-core install chromium` once). Not shipped; nothing imports it.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { chromium } from 'playwright-core'

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'docs', 'assets')
const PAGE = '/examples/vanilla/index.html'
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.css': 'text/css' }
/** Where the Orders API box sits in the fitted picture, as a share of its width and height. */
const TRACED_BOX = { x: 0.5, y: 0.34 }

const server = createServer(async (request, response) => {
  const path = normalize(join(ROOT, decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)))
  if (!path.startsWith(ROOT + sep)) return response.writeHead(403).end()
  try {
    response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(await readFile(path))
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
const origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`

const browser = await chromium.launch()
const problems = []
try {
  for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage({ colorScheme: scheme, viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2 })
    page.on('pageerror', (error) => problems.push(`${scheme}: ${error.message}`))
    page.on('console', (message) => message.type() === 'error' && problems.push(`${scheme}: ${message.text()}`))
    await page.goto(origin + PAGE)
    await page.waitForFunction(() => document.querySelector('plotwork-diagram')?.fingerprint)
    const picture = await page.locator('plotwork-diagram').evaluate((element) => {
      const box = element.shadowRoot?.querySelector('img.picture')?.getBoundingClientRect()
      return box === undefined ? null : { x: box.left, y: box.top, width: box.width, height: box.height }
    })
    if (picture === null) throw new Error(`${scheme}: the viewer shows no picture`)
    await page.mouse.move(picture.x + picture.width * TRACED_BOX.x, picture.y + picture.height * TRACED_BOX.y)
    await page.waitForSelector('plotwork-diagram >> svg.trace')
    const file = join(OUT, `viewer-${scheme}.png`)
    await page.locator('plotwork-diagram').screenshot({ path: file })
    process.stdout.write(`wrote ${file.slice(ROOT.length + 1)}\n`)
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}
if (problems.length > 0) {
  process.stderr.write(`The page logged errors:\n${problems.map((line) => `  ${line}`).join('\n')}\n`)
  process.exit(1)
}
