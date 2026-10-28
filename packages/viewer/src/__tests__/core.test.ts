import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  drawnScheme,
  fingerprintOf,
  isFingerprint,
  liveIntervalOf,
  loadPicture,
  PictureLoadError,
  pictureUrl,
  readEmbeddedSource,
  readTraceMap,
  traceOf,
  drillNodeAt,
  watchLive,
  withScheme,
} from '../core/index.js'
import type { WatchHost } from '../core/index.js'
import { CHECKOUT_DARK_SVG, CHECKOUT_SOURCE, CHECKOUT_SVG } from './fixtures.js'

describe('reading a picture the engine drew', () => {
  it('finds its boxes, its lines, and the box that opens part 2', () => {
    const map = readTraceMap(CHECKOUT_SVG)
    expect(map).not.toBeNull()
    if (map === null) return
    expect(map.nodes.map((node) => node.name).sort()).toEqual(['Events', 'Orders', 'Orders API', 'Web tier'])
    expect(map.lines.map((line) => `${line.from}>${line.to}`).sort()).toEqual(['api>db', 'api>queue', 'web>api'])
    expect(traceOf(map, 'api')?.lines).toHaveLength(3)
    const web = map.nodes.find((node) => node.id === 'web')
    expect(web?.part).toBe(2)
    if (web === undefined) return
    const middle = { x: web.box.x + web.box.width / 2, y: web.box.y + web.box.height / 2 }
    expect(drillNodeAt(map, middle)?.id).toBe('web')
  })

  it('gives back the source a picture carries, and says when it carries none', () => {
    expect(readEmbeddedSource(CHECKOUT_SVG)).toEqual({ status: 'found', source: CHECKOUT_SOURCE })
    expect(readEmbeddedSource(CHECKOUT_DARK_SVG)).toEqual({ status: 'none' })
    expect(readEmbeddedSource('not a picture')).toEqual({ status: 'unreadable' })
  })

  it('answers text that is not a picture with null, never an exception', () => {
    expect(readTraceMap('<html></html>')).toBeNull()
    expect(readTraceMap('<svg')).toBeNull()
  })
})

describe('colour schemes', () => {
  it('forces a scheme on the root of a picture that follows the reader, replacing any earlier one', () => {
    const dark = withScheme(CHECKOUT_SVG, 'dark')
    expect(dark.startsWith('<svg data-scheme="dark" ')).toBe(true)
    const rootTag = (/<svg[^>]*>/.exec(withScheme(dark, 'light')) ?? [''])[0]
    expect(rootTag.match(/data-scheme=/g)).toEqual(['data-scheme='])
    expect(rootTag).toContain('data-scheme="light"')
    expect(withScheme(CHECKOUT_SVG, 'auto')).toBe(CHECKOUT_SVG)
  })

  it('reads the scheme a picture was drawn in', () => {
    expect(drawnScheme(CHECKOUT_DARK_SVG)).toBe('dark')
    expect(drawnScheme(CHECKOUT_SVG)).toBeNull()
  })
})

describe('fingerprints', () => {
  it('are the SHA-256 of the text in UTF-8, the same value an embed link sends as its ETag', async () => {
    const expected = `sha256-${createHash('sha256').update(CHECKOUT_SVG, 'utf8').digest('hex')}`
    expect(await fingerprintOf(CHECKOUT_SVG)).toBe(expected)
    expect(isFingerprint(expected)).toBe(true)
    expect(isFingerprint('sha256-xyz')).toBe(false)
  })
})

describe('loading a picture', () => {
  const answer = (body: string, init: ResponseInit = {}): typeof fetch => vi.fn(async () => new Response(body, init)) as unknown as typeof fetch

  it('refuses an address that is not http or https', () => {
    expect(pictureUrl('javascript:alert(1)', 'https://docs.example.com/')).toBeNull()
    expect(pictureUrl('data:image/svg+xml,<svg/>', 'https://docs.example.com/')).toBeNull()
    expect(pictureUrl('/diagrams/a.svg', 'https://docs.example.com/guide/')?.href).toBe('https://docs.example.com/diagrams/a.svg')
  })

  it('sends no cookie, asks for an image, and revalidates when asked', async () => {
    const fetcher = answer(CHECKOUT_SVG)
    const url = new URL('https://cdn.plotwork.dev/l/a.svg')
    expect(await loadPicture(url, { fetcher, revalidate: true })).toBe(CHECKOUT_SVG)
    const [, init] = vi.mocked(fetcher).mock.calls[0] ?? []
    expect(init).toMatchObject({ credentials: 'omit', cache: 'no-cache', headers: { Accept: 'image/svg+xml' } })
  })

  it('names why a picture could not be loaded', async () => {
    const url = new URL('https://cdn.plotwork.dev/d/a.svg')
    const reason = (fetcher: typeof fetch) => loadPicture(url, { fetcher }).catch((error: unknown) => (error instanceof PictureLoadError ? error.reason : 'thrown'))
    expect(await reason(answer('', { status: 404 }))).toBe('missing')
    expect(await reason(answer('<html></html>'))).toBe('not-a-picture')
    expect(await reason(answer('<svg/>', { headers: { 'content-length': String(10 * 1024 * 1024) } }))).toBe('not-a-picture')
    expect(await reason(vi.fn(async () => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch)).toBe('network')
  })
})

describe('watching a live picture', () => {
  function fakeHost(visible: { value: boolean }) {
    let tick: (() => void) | null = null
    let onVisible: (() => void) | null = null
    const host: WatchHost = {
      isVisible: () => visible.value,
      onVisible(listener) {
        onVisible = listener
        return () => {
          onVisible = null
        }
      },
      setInterval(handler) {
        tick = handler
        return 1
      },
      clearInterval() {
        tick = null
      },
    }
    return { host, tick: () => tick?.(), show: () => onVisible?.(), stopped: () => tick === null && onVisible === null }
  }

  it('checks on its interval only while the page is in view, and stops when told', async () => {
    const visible = { value: true }
    const fake = fakeHost(visible)
    const check = vi.fn(async () => undefined)
    const stop = watchLive(fake.host, 60, check)
    fake.tick()
    await Promise.resolve()
    expect(check).toHaveBeenCalledTimes(1)
    visible.value = false
    await new Promise((resolve) => setTimeout(resolve, 0))
    fake.tick()
    expect(check).toHaveBeenCalledTimes(1)
    visible.value = true
    fake.show()
    expect(check).toHaveBeenCalledTimes(2)
    stop()
    expect(fake.stopped()).toBe(true)
  })

  it('reads its interval with a floor of 15 seconds and a default of 60', () => {
    expect(liveIntervalOf(null)).toBe(60)
    expect(liveIntervalOf('abc')).toBe(60)
    expect(liveIntervalOf('5')).toBe(15)
    expect(liveIntervalOf('120')).toBe(120)
  })
})
