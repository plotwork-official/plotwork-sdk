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

  it('renders on a server as the bare element, with no browser in sight', () => {
    expect(renderToString(<PlotworkDiagram src="/a.svg" live />)).toBe('<plotwork-diagram src="/a.svg" live=""></plotwork-diagram>')
  })
})
