#!/usr/bin/env node
/**
 * Records the viewer film (`docs/film/`) in light and in dark: it serves the repository, opens the film page in Chromium with the
 * film's clock stopped, draws every frame at its time with `film.seek`, screenshots it, and joins the frames with ffmpeg into
 *
 *   <out>/landscape-<scheme>.mp4   1280 by 720, H.264, for YouTube and posts
 *   <out>/readme-<scheme>.webp     960 wide, looping, for the README
 *
 * `--out` is where they go, `docs/film/out` by default (ignored by git); the assets repository serves them at
 * assets.plotwork.dev/media/films/sdk/. It fails on any error the page logs. It needs Chromium for Playwright and ffmpeg.
 *
 *   pnpm film [--out <folder>] [--fps 25]
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright-core'

const ROOT = join(import.meta.dirname, '..')
const { values } = parseArgs({ options: { out: { type: 'string' }, fps: { type: 'string' } } })
const OUT = resolve(values.out ?? join(ROOT, 'docs', 'film', 'out'))
const FPS = Number(values.fps ?? 25)
const README_FPS = 12.5
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.css': 'text/css' }

if (!Number.isInteger(FPS) || FPS < 5 || FPS > 60) throw new Error('--fps must be a whole number from 5 to 60')

function ffmpeg(args) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`)
}

const server = createServer(async (request, response) => {
  const path = normalize(join(ROOT, decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)))
  if (!path.startsWith(ROOT + sep)) return response.writeHead(403).end()
  try {
    response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(await readFile(path))
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
const address = server.address()
const origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const problems = []
try {
  for (const scheme of ['light', 'dark']) {
    const frames = mkdtempSync(join(tmpdir(), `plotwork-film-${scheme}-`))
    const page = await browser.newPage({ colorScheme: scheme, viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' })
    page.on('pageerror', (error) => problems.push(`${scheme}: ${error.message}`))
    page.on('console', (message) => message.type() === 'error' && problems.push(`${scheme}: ${message.text()}`))
    await page.goto(`${origin}/docs/film/index.html?frames`)
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true')
    await page.evaluate(() => document.fonts.ready)
    const length = await page.evaluate(() => window.film.length)
    const count = Math.round((length / 1000) * FPS)
    for (let frame = 0; frame < count; frame += 1) {
      await page.evaluate((t) => window.film.seek(t), (frame * 1000) / FPS)
      await page.evaluate(() => new Promise((painted) => requestAnimationFrame(() => requestAnimationFrame(painted))))
      await page.screenshot({ path: join(frames, `${String(frame).padStart(5, '0')}.png`) })
    }
    await page.close()
    const input = ['-framerate', String(FPS), '-i', join(frames, '%05d.png')]
    ffmpeg([...input, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', join(OUT, `landscape-${scheme}.mp4`)])
    ffmpeg([...input, '-vf', `fps=${README_FPS},scale=960:-2:flags=lanczos`, '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', '72', '-compression_level', '6', '-loop', '0', join(OUT, `readme-${scheme}.webp`)])
    rmSync(frames, { recursive: true, force: true })
    process.stdout.write(`wrote landscape-${scheme}.mp4 and readme-${scheme}.webp (${count} frames)\n`)
  }
} finally {
  await browser.close()
  server.close()
}
if (problems.length > 0) {
  process.stderr.write(`The page logged errors:\n${problems.map((line) => `  ${line}`).join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`Films in ${OUT}\n`)
