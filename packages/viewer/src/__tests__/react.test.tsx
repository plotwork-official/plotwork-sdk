import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { PlotworkDiagram } from '../react/index.js'
import type { PlotworkDiagramElement } from '../react/index.js'
import { installBrowserStubs, settle } from './browser-stubs.js'
import { CHECKOUT_SVG } from './fixtures.js'

beforeAll(() => {
  installBrowserStubs()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

describe('<PlotworkDiagram>', () => {
  it('registers the element, passes the picture, and calls back with its events', async () => {
    const onLoad = vi.fn()
    const ref = createRef<PlotworkDiagramElement>()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<PlotworkDiagram ref={ref} svg={CHECKOUT_SVG} theme="dark" label="Checkout" onLoad={onLoad} />)
    })
    await act(settle)
    expect(customElements.get('plotwork-diagram')).toBeDefined()
    expect(ref.current?.getAttribute('theme')).toBe('dark')
    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ hasSource: true }))
    expect(ref.current?.source()).toContain('flow "Checkout"')
    await act(async () => root.unmount())
  })

  it('listens before it hands over the picture, so a load that settles before passive effects run is never missed', async () => {
    const order: string[] = []
    const listen = EventTarget.prototype.addEventListener
    const spy = vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(function (this: EventTarget, ...args: Parameters<EventTarget['addEventListener']>) {
      if (args[0] === 'plotwork-load') order.push('listen')
      return listen.apply(this, args)
    })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const ref = (node: PlotworkDiagramElement | null): void => {
      if (node === null) return
      const own = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'svg')
      Object.defineProperty(node, 'svg', {
        configurable: true,
        get: () => own?.get?.call(node),
        set: (value: string | null) => {
          if (value !== null) order.push('svg')
          own?.set?.call(node, value)
        },
      })
    }
    await act(async () => {
      root.render(<PlotworkDiagram ref={ref} svg={CHECKOUT_SVG} />)
    })
    spy.mockRestore()
    expect(order).toEqual(['listen', 'svg'])
    await act(async () => root.unmount())
  })

  it("hands the token and fetch to the element before its first request, and a new token function each render costs no request", async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(CHECKOUT_SVG))
    const onLoad = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const draw = (): Promise<void> =>
      act(async () => {
        root.render(<PlotworkDiagram src="https://api.plotwork.dev/v1/library/abc.svg" token={() => 'pwa_1'} fetch={fetcher} onLoad={onLoad} />)
      })
    await draw()
    await act(settle)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', headers: { Authorization: 'Bearer pwa_1' } })
    expect(onLoad).toHaveBeenCalledTimes(1)
    await draw()
    await act(settle)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })

  it('renders on a server as the bare element, with no browser in sight', () => {
    expect(renderToString(<PlotworkDiagram src="/a.svg" live />)).toBe('<plotwork-diagram src="/a.svg" live=""></plotwork-diagram>')
  })
})
