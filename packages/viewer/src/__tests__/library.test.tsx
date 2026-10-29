import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { definePlotworkLibrary, fetchLibraryPage, pictureUrlOf } from '../library/index.js'
import type { PlotworkLibraryElement } from '../library/index.js'
import { foldForSearch, matches } from '../library/listbox.js'
import { PlotworkLibrary } from '../react/index.js'
import { installBrowserStubs, settle } from './browser-stubs.js'

beforeAll(() => {
  installBrowserStubs()
  definePlotworkLibrary()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

const ITEMS = [
  { id: 'a1', name: 'Checkout flow', folder: 'Payments', scheme: 'auto', bytes: 100, updatedAt: Date.UTC(2026, 9, 1), classification: 'confidential' },
  { id: 'b2', name: 'Orders schema', folder: null, scheme: 'light', bytes: 100, updatedAt: Date.UTC(2026, 9, 2), classification: null },
  { id: 'c3', name: null, folder: 'Café', scheme: 'dark', bytes: 100, updatedAt: Date.UTC(2026, 9, 3), classification: 'internal' },
]

const page = (items: unknown[], nextCursor: string | null = null, status = 200) => new Response(JSON.stringify({ items, nextCursor }), { status, headers: { 'content-type': 'application/json' } })

function libraryFetch(...answers: Response[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return answers.shift() ?? page([], null, 500)
  })
  return { fetcher, calls }
}

function mount(attributes: Record<string, string> = {}) {
  const element = document.createElement('plotwork-library') as PlotworkLibraryElement
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  const events: Record<string, unknown[]> = {}
  for (const type of ['plotwork-select', 'plotwork-error']) element.addEventListener(type, (event) => (events[type] ??= []).push((event as CustomEvent).detail))
  const shadow = element.shadowRoot as ShadowRoot
  const part = <T extends Element>(selector: string): T => shadow.querySelector(selector) as T
  const options = (): HTMLElement[] => [...shadow.querySelectorAll<HTMLElement>('[role="option"]')].filter((option) => !option.hidden)
  return { element, events, part, options }
}

const key = (target: Element, name: string): void => void target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))

describe('<plotwork-library>', () => {
  it("lists the person's diagrams with their token and no cookie, as text, with folder, date and label", async () => {
    const { fetcher, calls } = libraryFetch(page(ITEMS))
    const { element, part, options } = mount({ 'base-url': 'https://api-preview.plotwork.dev', folder: 'Payments' })
    document.body.append(element)
    element.token = () => 'pwa_1'
    element.fetch = fetcher
    await settle()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://api-preview.plotwork.dev/v1/library?limit=100&folder=Payments')
    expect(calls[0]?.init).toMatchObject({ credentials: 'omit', headers: { Authorization: 'Bearer pwa_1', Accept: 'application/json' } })
    expect(options().map((option) => option.querySelector('.name')?.textContent)).toEqual(['Checkout flow', 'Orders schema', 'Untitled diagram'])
    expect(options()[0]?.textContent).toContain('Payments')
    expect(options()[0]?.querySelector('[part="badge"]')?.textContent).toBe('Confidential')
    expect(part<HTMLElement>('[role="listbox"]').getAttribute('aria-label')).toBe('Your Plotwork diagrams')
    expect(part<HTMLElement>('.notice').hidden).toBe(true)
    expect(part<HTMLElement>('.live').textContent).toBe('3 diagrams')
    expect(element.items.map((item) => item.id)).toEqual(['a1', 'b2', 'c3'])
  })

  it('filters by name and folder, ignoring case and accents, and says when nothing matches', async () => {
    const { fetcher } = libraryFetch(page(ITEMS))
    const { element, part, options } = mount()
    element.fetch = fetcher
    document.body.append(element)
    await settle()
    const search = part<HTMLInputElement>('input[type="search"]')
    search.value = 'cafe'
    search.dispatchEvent(new Event('input'))
    expect(options().map((option) => option.dataset.id)).toEqual(['c3'])
    search.value = 'payments CHECK'
    search.dispatchEvent(new Event('input'))
    expect(options().map((option) => option.dataset.id)).toEqual(['a1'])
    search.value = 'nothing like it'
    search.dispatchEvent(new Event('input'))
    expect(options()).toHaveLength(0)
    expect(part<HTMLElement>('.notice').textContent).toBe('No diagram matches "nothing like it".')
    expect(part<HTMLElement>('[role="listbox"]').hidden).toBe(true)
  })

  it('moves with the arrows, Home and End, and chooses with Enter, sending the picture address', async () => {
    const { fetcher } = libraryFetch(page(ITEMS))
    const { element, events, part } = mount()
    element.token = 'pwa_1'
    element.fetch = fetcher
    document.body.append(element)
    await settle()
    const search = part<HTMLInputElement>('input[type="search"]')
    const list = part<HTMLElement>('[role="listbox"]')
    key(search, 'ArrowDown')
    expect(element.shadowRoot?.activeElement).toBe(list)
    const active = (): string | undefined => part<HTMLElement>(`#${list.getAttribute('aria-activedescendant') ?? 'none'}`)?.dataset.id
    expect(active()).toBe('a1')
    key(list, 'ArrowDown')
    key(list, 'ArrowDown')
    key(list, 'ArrowDown')
    expect(active()).toBe('c3')
    key(list, 'Home')
    expect(active()).toBe('a1')
    key(list, 'End')
    key(list, 'ArrowUp')
    key(list, 'Enter')
    expect(events['plotwork-select']).toEqual([{ id: 'b2', name: 'Orders schema', pictureUrl: 'https://api.plotwork.dev/v1/library/b2.svg' }])
    expect(element.selected).toBe('b2')
    expect(part<HTMLElement>('[data-id="b2"]').getAttribute('aria-selected')).toBe('true')
    expect(part<HTMLElement>('[data-id="a1"]').getAttribute('aria-selected')).toBe('false')
    key(list, 'Escape')
    expect(element.shadowRoot?.activeElement).toBe(search)
  })

  it('chooses with a press', async () => {
    const { fetcher } = libraryFetch(page(ITEMS))
    const { element, events, part } = mount()
    element.fetch = fetcher
    document.body.append(element)
    await settle()
    part<HTMLElement>('[data-id="c3"] .meta').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(events['plotwork-select']).toEqual([{ id: 'c3', name: null, pictureUrl: 'https://api.plotwork.dev/v1/library/c3.svg' }])
  })

  it('asks to sign in without a request when it has no token, and loads when one arrives', async () => {
    const global = vi.fn(async () => page(ITEMS))
    vi.stubGlobal('fetch', global)
    const { element, events, part, options } = mount()
    document.body.append(element)
    await settle()
    expect(global).not.toHaveBeenCalled()
    expect(events['plotwork-error']).toEqual([{ reason: 'signed-out' }])
    expect(part<HTMLElement>('.notice').textContent).toBe('Sign in with Plotwork to see your diagrams.')
    element.token = 'pwa_1'
    await settle()
    expect(global).toHaveBeenCalledTimes(1)
    expect(options()).toHaveLength(3)
  })

  it('says the library is empty, a refused token, a missing scope, and a failure with Try again', async () => {
    const { fetcher } = libraryFetch(page([]), page([], null, 401), page([], null, 403), page([], null, 500), page(ITEMS))
    const { element, events, part, options } = mount()
    element.token = 'pwa_1'
    element.fetch = fetcher
    document.body.append(element)
    await settle()
    expect(part<HTMLElement>('.notice').textContent).toBe('No diagrams yet. A diagram you publish appears here.')
    for (const _ of [1, 2, 3]) {
      await element.reload()
      await settle()
    }
    expect(events['plotwork-error']).toEqual([{ reason: 'signed-out' }, { reason: 'forbidden' }, { reason: 'network' }])
    const retry = [...(element.shadowRoot?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Try again') as HTMLButtonElement
    expect(retry.hidden).toBe(false)
    retry.click()
    await settle()
    expect(options()).toHaveLength(3)
  })

  it('loads the next page on Load more, keeping what the search shows', async () => {
    const [first, second, third] = ITEMS
    const { fetcher, calls } = libraryFetch(page([first, second], 'next-1'), page([third]))
    const { element, options } = mount()
    element.fetch = fetcher
    document.body.append(element)
    await settle()
    const more = [...(element.shadowRoot?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Load more') as HTMLButtonElement
    expect(more.hidden).toBe(false)
    more.click()
    await settle()
    expect(calls[1]?.url).toBe('https://api.plotwork.dev/v1/library?limit=100&cursor=next-1')
    expect(options().map((option) => option.dataset.id)).toEqual(['a1', 'b2', 'c3'])
    expect(more.hidden).toBe(true)
  })

  it('never sends a token over plain http to another host', async () => {
    const { fetcher } = libraryFetch(page(ITEMS))
    const { element, events } = mount({ 'base-url': 'http://example.com' })
    element.token = 'pwa_1'
    element.fetch = fetcher
    document.body.append(element)
    await settle()
    expect(fetcher).not.toHaveBeenCalled()
    expect(events['plotwork-error']).toEqual([{ reason: 'address' }])
  })
})

describe('the library helpers', () => {
  it('folds accents and case, and needs every word', () => {
    expect(foldForSearch('Café Ölçü')).toBe('cafe olcu')
    expect(matches({ id: 'x', name: 'Checkout', folder: 'Payments', updatedAt: 0, classification: null }, 'pay check', 'Untitled')).toBe(true)
    expect(matches({ id: 'x', name: null, folder: null, updatedAt: 0, classification: null }, 'untitled', 'Untitled')).toBe(true)
    expect(matches({ id: 'x', name: 'Checkout', folder: null, updatedAt: 0, classification: null }, 'orders', 'Untitled')).toBe(false)
  })

  it('keeps the path of a base address, and skips items with no id', async () => {
    expect(pictureUrlOf('https://example.com/plotwork', 'a b')).toBe('https://example.com/plotwork/v1/library/a%20b.svg')
    const fetcher = vi.fn(async () => page([{ id: '' }, { name: 'no id' }, { id: 'ok', name: '<b>x</b>', classification: 'secret' }]))
    const result = await fetchLibraryPage({ baseUrl: 'https://api.plotwork.dev', fetch: fetcher })
    expect(result.items).toEqual([{ id: 'ok', name: '<b>x</b>', folder: null, updatedAt: 0, classification: null }])
  })
})

describe('<PlotworkLibrary>', () => {
  it('sets the token before the first request and calls back with a choice', async () => {
    const { fetcher, calls } = libraryFetch(page(ITEMS))
    const onSelect = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<PlotworkLibrary token={() => 'pwa_9'} fetch={fetcher} baseUrl="https://api-preview.plotwork.dev" onSelect={onSelect} />)
    })
    await act(settle)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer pwa_9' })
    const element = host.querySelector('plotwork-library') as PlotworkLibraryElement
    element.shadowRoot?.querySelector<HTMLElement>('[data-id="a1"]')?.click()
    expect(onSelect).toHaveBeenCalledWith({ id: 'a1', name: 'Checkout flow', pictureUrl: 'https://api-preview.plotwork.dev/v1/library/a1.svg' })
    await act(async () => root.unmount())
  })

  it('renders on a server as the bare element', () => {
    expect(renderToString(<PlotworkLibrary baseUrl="https://api.plotwork.dev" folder="Payments" />)).toBe('<plotwork-library base-url="https://api.plotwork.dev" folder="Payments"></plotwork-library>')
  })
})
