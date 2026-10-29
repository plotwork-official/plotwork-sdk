import type { Fetcher, TokenSource } from '../core/access.js'
import { html } from '../element/dom.js'
import { mergeLibraryLabels } from './copy.js'
import type { LibraryLabels } from './copy.js'
import { Listbox } from './listbox.js'
import { DEFAULT_API_URL, fetchLibraryPage, LibraryLoadError, pictureUrlOf } from './pages.js'
import type { LibraryFailure, LibraryItem } from './pages.js'
import { LIBRARY_CSS } from './styles.js'

/** The attributes the element reads. */
export const LIBRARY_ATTRIBUTES = ['base-url', 'folder', 'label'] as const

/** A diagram was chosen: its id, its name, and the address of its picture for `<plotwork-diagram src>` with the same token. */
export interface SelectDetail {
  id: string
  name: string | null
  pictureUrl: string
}

/** The library cannot be shown, and the notice says why. */
export interface LibraryErrorDetail {
  reason: LibraryFailure
}

export interface PlotworkLibraryEventMap {
  'plotwork-select': CustomEvent<SelectDetail>
  'plotwork-error': CustomEvent<LibraryErrorDetail>
}

/** What a page can call and set on `<plotwork-library>`, besides its attributes. */
export interface PlotworkLibraryElement extends HTMLElement {
  /** A token from Sign in with Plotwork with `library:read`, or a function that gives the current one. */
  token: TokenSource | null
  /** The `fetch` the element calls, such as a proxy's that adds the token on a server. */
  fetch: Fetcher | null
  labels: Partial<LibraryLabels> | undefined
  /** The diagrams loaded so far. */
  readonly items: readonly LibraryItem[]
  /** The id of the diagram chosen last, or null. */
  readonly selected: string | null
  /** Reads the library again from its first page. */
  reload(): Promise<void>
}

interface Shell {
  search: HTMLInputElement
  list: HTMLUListElement
  notice: HTMLParagraphElement
  retry: HTMLButtonElement
  more: HTMLButtonElement
  live: HTMLDivElement
}

function buildShell(root: ShadowRoot, labels: LibraryLabels): Shell {
  const style = html('style')
  style.textContent = LIBRARY_CSS
  const search = html('input', { type: 'search', class: 'search', part: 'search', 'aria-label': labels.search, placeholder: labels.search, 'aria-controls': 'list', autocomplete: 'off', spellcheck: 'false' })
  const list = html('ul', { id: 'list', class: 'list', part: 'list', role: 'listbox', tabindex: 0, 'aria-label': labels.list, hidden: '' })
  const notice = html('p', { class: 'notice', part: 'notice', role: 'status' }, labels.loading)
  const retry = html('button', { type: 'button', part: 'button', hidden: '' }, labels.retry)
  const more = html('button', { type: 'button', part: 'button', hidden: '' }, labels.more)
  const live = html('div', { class: 'live', 'aria-live': 'polite' })
  root.append(style, html('div', { class: 'stage', part: 'stage' }, search, list, notice, retry, more, live))
  return { search, list, notice, retry, more, live }
}

/**
 * `<plotwork-library>`: a list of a signed-in person's diagrams from `GET /v1/library` to pick one from. A search box filters what is
 * loaded, the list is a listbox for the keyboard, and a choice sends `plotwork-select`. Made on first use, like `<plotwork-diagram>`,
 * so importing it on a server is safe.
 */
export function createPlotworkLibraryClass(): CustomElementConstructor {
  return class PlotworkLibrary extends HTMLElement implements PlotworkLibraryElement {
    static get observedAttributes(): readonly string[] {
      return LIBRARY_ATTRIBUTES
    }

    #shell: Shell
    #listbox: Listbox
    #labels: LibraryLabels = mergeLibraryLabels(undefined)
    #ownLabels: Partial<LibraryLabels> | undefined
    #token: TokenSource | null = null
    #fetcher: Fetcher | null = null
    #items: LibraryItem[] = []
    #cursor: string | null = null
    #failure: LibraryFailure | null = null
    #loaded = false
    #loading: AbortController | null = null
    #cleanup: (() => void)[] = []

    constructor() {
      super()
      this.#shell = buildShell(this.attachShadow({ mode: 'open' }), this.#labels)
      this.#listbox = new Listbox(this.#shell.list, () => this.#labels, (item) => this.#chosen(item))
    }

    connectedCallback(): void {
      /* A property set before the element was defined sits on the instance and hides the accessor: move it onto the accessor. */
      for (const name of ['labels', 'token', 'fetch'] as const) {
        if (!Object.hasOwn(this, name)) continue
        const value: unknown = (this as Record<string, unknown>)[name]
        delete (this as Record<string, unknown>)[name]
        ;(this as Record<string, unknown>)[name] = value
      }
      const { search, list, retry, more } = this.#shell
      const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, listener: (event: HTMLElementEventMap[K]) => void): void => {
        target.addEventListener(type, listener)
        this.#cleanup.push(() => target.removeEventListener(type, listener))
      }
      on(search, 'input', () => this.#render())
      on(search, 'keydown', (event) => {
        if (event.key !== 'ArrowDown') return
        event.preventDefault()
        this.#listbox.enter()
      })
      on(list, 'keydown', (event) => {
        if (event.key === 'Escape' || (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey)) search.focus()
      })
      on(retry, 'click', () => void this.reload())
      on(more, 'click', () => void this.#load(true))
      this.#describe()
      void this.#load()
    }

    disconnectedCallback(): void {
      for (const undo of this.#cleanup.splice(0)) undo()
      this.#loading?.abort()
      this.#loading = null
    }

    attributeChangedCallback(name: string, before: string | null, after: string | null): void {
      if (before === after || !this.isConnected) return
      if (name === 'label') this.#describe()
      else void this.reload()
    }

    get token(): TokenSource | null {
      return this.#token
    }

    set token(value: TokenSource | null) {
      this.#token = typeof value === 'function' || (typeof value === 'string' && value !== '') ? value : null
      this.#retryAfterAccess()
    }

    get fetch(): Fetcher | null {
      return this.#fetcher
    }

    set fetch(value: Fetcher | null) {
      this.#fetcher = typeof value === 'function' ? value : null
      this.#retryAfterAccess()
    }

    get labels(): Partial<LibraryLabels> | undefined {
      return this.#ownLabels
    }

    set labels(value: Partial<LibraryLabels> | undefined) {
      this.#ownLabels = value
      this.#labels = mergeLibraryLabels(value)
      const { search, retry, more } = this.#shell
      search.setAttribute('aria-label', this.#labels.search)
      search.placeholder = this.#labels.search
      retry.textContent = this.#labels.retry
      more.textContent = this.#labels.more
      this.#describe()
      this.#listbox.relabel()
      if (this.#failure !== null) this.#shell.notice.textContent = this.#labels.failed[this.#failure]
      else if (this.#loaded) this.#render()
    }

    get items(): readonly LibraryItem[] {
      return this.#items
    }

    get selected(): string | null {
      return this.#listbox.chosen
    }

    async reload(): Promise<void> {
      await this.#load(false)
    }

    /** A token or a `fetch` given after the library could not be read (before sign-in) reads it again. */
    #retryAfterAccess(): void {
      if (this.isConnected && this.#failure !== null) void this.reload()
    }

    #baseUrl(): string {
      return this.getAttribute('base-url') ?? DEFAULT_API_URL
    }

    async #load(more = false): Promise<void> {
      this.#loading?.abort()
      const loading = new AbortController()
      this.#loading = loading
      // One microtask first, so a token a framework sets just after it connects the element is used.
      await Promise.resolve()
      if (loading.signal.aborted) return
      if (this.#token === null && this.#fetcher === null) return this.#fail('signed-out')
      const { notice, retry, list, more: moreButton } = this.#shell
      if (!more) {
        notice.textContent = this.#labels.loading
        notice.hidden = false
        retry.hidden = true
        list.hidden = true
        list.setAttribute('aria-busy', 'true')
      }
      moreButton.disabled = true
      try {
        const page = await fetchLibraryPage({ baseUrl: this.#baseUrl(), folder: this.getAttribute('folder'), cursor: more ? this.#cursor : null, token: this.#token, fetch: this.#fetcher, signal: loading.signal })
        if (loading.signal.aborted) return
        this.#items = more ? [...this.#items, ...page.items.filter((item) => !this.#items.some((held) => held.id === item.id))] : page.items
        this.#cursor = page.nextCursor
        this.#failure = null
        this.#loaded = true
        this.#render()
      } catch (error) {
        if (!loading.signal.aborted) this.#fail(error instanceof LibraryLoadError ? error.reason : 'network')
      } finally {
        if (this.#loading === loading) this.#loading = null
        moreButton.disabled = false
        list.setAttribute('aria-busy', 'false')
      }
    }

    /** Shows the diagrams the search matches, or why there are none. */
    #render(): void {
      const { search, list, notice, retry, more, live } = this.#shell
      const count = this.#listbox.set(this.#items, search.value)
      const query = search.value.trim()
      search.hidden = this.#items.length === 0
      list.hidden = count === 0
      retry.hidden = true
      more.hidden = this.#cursor === null
      notice.hidden = count > 0
      notice.textContent = this.#items.length === 0 ? this.#labels.empty : count === 0 ? this.#labels.noMatch(query) : ''
      live.textContent = count > 0 ? this.#labels.results(count) : ''
    }

    #fail(reason: LibraryFailure): void {
      const { search, list, notice, retry, more, live } = this.#shell
      search.hidden = true
      this.#failure = reason
      this.#loaded = false
      this.#items = []
      this.#cursor = null
      this.#listbox.set([], '')
      list.hidden = true
      more.hidden = true
      notice.textContent = this.#labels.failed[reason]
      notice.hidden = false
      retry.hidden = reason === 'signed-out' || reason === 'address'
      live.textContent = ''
      this.dispatchEvent(new CustomEvent('plotwork-error', { detail: { reason }, bubbles: true, composed: true }))
    }

    #chosen(item: LibraryItem): void {
      const detail: SelectDetail = { id: item.id, name: item.name, pictureUrl: pictureUrlOf(this.#baseUrl(), item.id) }
      this.dispatchEvent(new CustomEvent('plotwork-select', { detail, bubbles: true, composed: true }))
    }

    #describe(): void {
      this.#shell.list.setAttribute('aria-label', this.getAttribute('label') ?? this.#labels.list)
    }
  }
}
