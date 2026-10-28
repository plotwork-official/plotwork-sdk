import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { fitView, fingerprintOf, readTraceMap } from '../core/index.js'
import { definePlotworkDiagram } from '../element/define.js'
import type { PlotworkDiagramElement } from '../element/plotwork-diagram.js'
import { CANVAS_SIZE, installBrowserStubs, settle } from './browser-stubs.js'
import { CHECKOUT_DARK_SVG, CHECKOUT_SOURCE, CHECKOUT_SVG } from './fixtures.js'

beforeAll(() => {
  installBrowserStubs()
  definePlotworkDiagram()
})

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

/** A `<plotwork-diagram>` on the page with these attributes, and the events it sent, by type. */
function mount(attributes: Record<string, string> = {}, svg?: string) {
  const element = document.createElement('plotwork-diagram') as PlotworkDiagramElement
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  const events: Record<string, unknown[]> = {}
  for (const type of ['plotwork-load', 'plotwork-change', 'plotwork-error', 'plotwork-drill', 'plotwork-trace']) {
    element.addEventListener(type, (event) => (events[type] ??= []).push((event as CustomEvent).detail))
  }
  if (svg !== undefined) element.svg = svg
  document.body.append(element)
  const shadow = element.shadowRoot as ShadowRoot
  const part = <T extends Element>(selector: string): T => shadow.querySelector(selector) as T
  return { element, events, part }
}

describe('<plotwork-diagram>', () => {
  it('shows a picture it is given as text, fitted, with its fingerprint and its source', async () => {
    const { element, events, part } = mount({ label: 'Checkout' }, CHECKOUT_SVG)
    await settle()
    const fingerprint = await fingerprintOf(CHECKOUT_SVG)
    expect(events['plotwork-load']).toEqual([{ fingerprint, hasSource: true }])
    expect(element.fingerprint).toBe(fingerprint)
    expect(element.source()).toBe(CHECKOUT_SOURCE)
    const picture = part<HTMLImageElement>('img.picture')
    expect(picture.src).toMatch(/^blob:/)
    expect(picture.hidden).toBe(false)
    expect(part<HTMLElement>('.notice').hidden).toBe(true)
    expect(part<HTMLElement>('.canvas').getAttribute('aria-label')).toMatch(/^Checkout\. /)
    const map = readTraceMap(CHECKOUT_SVG)
    const fitted = fitView(CANVAS_SIZE, { width: map?.viewBox.width ?? 0, height: map?.viewBox.height ?? 0 })
    expect(picture.style.transform).toBe(`translate(${fitted.x}px, ${fitted.y}px)`)
  })

  it('fetches a picture from its address with no cookie, and paints the paper of a dark picture dark', async () => {
    const fetcher = vi.fn(async () => new Response(CHECKOUT_DARK_SVG))
    vi.stubGlobal('fetch', fetcher)
    const { element, events } = mount({ src: 'https://cdn.plotwork.dev/l/abc.svg' })
    await settle()
    expect(fetcher).toHaveBeenCalledWith('https://cdn.plotwork.dev/l/abc.svg', expect.objectContaining({ credentials: 'omit' }))
    expect(events['plotwork-load']).toHaveLength(1)
    expect(element.getAttribute('data-paper')).toBe('dark')
    expect(element.source()).toBeNull()
  })

  it('refuses a picture whose fingerprint is not the pinned one, and says why', async () => {
    const { events, part } = mount({ fingerprint: `sha256-${'0'.repeat(64)}` }, CHECKOUT_SVG)
    await settle()
    expect(events['plotwork-error']).toEqual([{ reason: 'fingerprint' }])
    expect(part<HTMLImageElement>('img.picture').hidden).toBe(true)
    expect(part<HTMLElement>('.notice').textContent).toContain('changed since the page pinned it')
  })

  it('refuses an address that is not http or https without fetching it', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { events } = mount({ src: 'javascript:alert(1)' })
    await settle()
    expect(fetcher).not.toHaveBeenCalled()
    expect(events['plotwork-error']).toEqual([{ reason: 'address' }])
  })

  it('shows a new version on reload and reports the change', async () => {
    let body = CHECKOUT_SVG
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
    const { element, events } = mount({ src: '/checkout.svg' })
    await settle()
    body = CHECKOUT_DARK_SVG
    await element.reload()
    await settle()
    expect(events['plotwork-change']).toEqual([{ fingerprint: await fingerprintOf(CHECKOUT_DARK_SVG), previous: await fingerprintOf(CHECKOUT_SVG) }])
    expect(events['plotwork-load']).toHaveLength(1)
  })

  it('sends a drill event for a press on a box that opens a part, and traces a box that does not', async () => {
    const { events, part } = mount({}, CHECKOUT_SVG)
    await settle()
    const map = readTraceMap(CHECKOUT_SVG)
    if (map === null) throw new Error('The fixture is not a picture')
    const view = fitView(CANVAS_SIZE, { width: map.viewBox.width, height: map.viewBox.height })
    const canvas = part<HTMLElement>('.canvas')
    const pressAt = (id: string): void => {
      const box = map.nodes.find((node) => node.id === id)?.box
      if (box === undefined) throw new Error(`No box ${id}`)
      const clientX = view.x + (box.x + box.width / 2 - map.viewBox.x) * view.scale
      const clientY = view.y + (box.y + box.height / 2 - map.viewBox.y) * view.scale
      canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX, clientY, bubbles: true }))
      canvas.dispatchEvent(new MouseEvent('pointerup', { button: 0, clientX, clientY, bubbles: true }))
    }
    pressAt('web')
    expect(events['plotwork-drill']).toEqual([{ id: 'web', part: 2, name: 'Web tier' }])
    pressAt('api')
    expect(events['plotwork-trace']).toEqual([{ id: 'api' }])
    expect(part<SVGSVGElement>('svg.trace')?.getAttribute('data-trace')).toBe('api')
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(part<SVGSVGElement>('svg.trace')).toBeNull()
  })

  it('zooms with its toolbar and keys, and fits again with 0', async () => {
    const { element, part } = mount({}, CHECKOUT_SVG)
    await settle()
    const level = part<HTMLOutputElement>('output')
    const fitted = level.value
    element.zoomIn()
    expect(level.value).not.toBe(fitted)
    part<HTMLElement>('.canvas').dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))
    expect(level.value).toBe(fitted)
  })

  it('takes words in another language', async () => {
    const { element, part } = mount({}, CHECKOUT_SVG)
    element.labels = { zoomIn: 'Agrandir' }
    await settle()
    expect(part<HTMLButtonElement>('button[aria-label="Agrandir"]')).not.toBeNull()
    expect(part<HTMLButtonElement>('button[aria-label="Zoom out"]')).not.toBeNull()
  })

  it('says there is nothing to show when it has neither src nor svg', async () => {
    const { events } = mount()
    await settle()
    expect(events['plotwork-error']).toEqual([{ reason: 'empty' }])
  })
})
