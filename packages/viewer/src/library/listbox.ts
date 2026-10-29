import { html } from '../element/dom.js'
import type { LibraryLabels } from './copy.js'
import type { LibraryItem } from './pages.js'

/**
 * The list of `<plotwork-library>`: an ARIA listbox of the diagrams loaded, one option each, filtered by the search box. The list
 * holds the focus and points at the active option with `aria-activedescendant`; the arrows, Home and End move it, and Enter, Space
 * or a press chooses it. Every option is built with `createElement`, and a diagram's name and folder are text, never markup.
 */

/** A name and a folder folded for search: no accents, lower case. */
export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
}

/** True when every word of the query is in the diagram's name or folder. */
export function matches(item: LibraryItem, query: string, untitled: string): boolean {
  const words = foldForSearch(query).split(/\s+/).filter((word) => word !== '')
  if (words.length === 0) return true
  const haystack = foldForSearch(`${item.name ?? untitled} ${item.folder ?? ''}`)
  return words.every((word) => haystack.includes(word))
}

export class Listbox {
  readonly list: HTMLUListElement
  #labels: () => LibraryLabels
  #choose: (item: LibraryItem) => void
  #items: LibraryItem[] = []
  #options = new Map<string, HTMLLIElement>()
  #visible: LibraryItem[] = []
  #active = -1
  #chosen: string | null = null
  #ids = 0

  constructor(list: HTMLUListElement, labels: () => LibraryLabels, choose: (item: LibraryItem) => void) {
    this.list = list
    this.#labels = labels
    this.#choose = choose
    list.addEventListener('click', (event) => {
      const option = (event.target as Element | null)?.closest?.('[role="option"]')
      const index = this.#visible.findIndex((item) => this.#options.get(item.id) === option)
      if (index >= 0) this.#pick(index)
    })
    list.addEventListener('keydown', (event) => this.#key(event))
  }

  /** The diagrams the list holds, in order. */
  get items(): readonly LibraryItem[] {
    return this.#items
  }

  /** The id of the diagram chosen last, or null. */
  get chosen(): string | null {
    return this.#chosen
  }

  /** Puts these diagrams in the list (all of them, or more after a page) and shows those the query matches. */
  set(items: readonly LibraryItem[], query: string): number {
    for (const item of items) {
      if (this.#options.has(item.id)) continue
      this.#ids += 1
      this.#options.set(item.id, this.#build(item, `option-${this.#ids}`))
    }
    const kept = new Set(items.map((item) => item.id))
    for (const [id, option] of this.#options) {
      if (kept.has(id)) continue
      option.remove()
      this.#options.delete(id)
    }
    this.#items = [...items]
    this.list.replaceChildren(...this.#items.map((item) => this.#options.get(item.id) as HTMLLIElement))
    return this.filter(query)
  }

  /** Shows only the diagrams the query matches, and returns how many. The active option stays when it still shows. */
  filter(query: string): number {
    const untitled = this.#labels().untitled
    const activeId = this.#visible[this.#active]?.id
    this.#visible = this.#items.filter((item) => matches(item, query, untitled))
    const shown = new Set(this.#visible.map((item) => item.id))
    for (const [id, option] of this.#options) option.hidden = !shown.has(id)
    this.#activate(this.#visible.findIndex((item) => item.id === activeId))
    return this.#visible.length
  }

  /** Moves the active option to the first one shown, when none is active; for a press of the down arrow in the search box. */
  enter(): void {
    if (this.#active < 0 && this.#visible.length > 0) this.#activate(0)
    this.list.focus()
  }

  /** Builds every option again, for new words. */
  relabel(): void {
    for (const [id, option] of this.#options) {
      const item = this.#items.find((candidate) => candidate.id === id)
      if (item !== undefined) option.replaceChildren(...this.#content(item))
    }
  }

  #build(item: LibraryItem, id: string): HTMLLIElement {
    return html('li', { id, role: 'option', part: 'option', 'aria-selected': item.id === this.#chosen ? 'true' : 'false', 'data-id': item.id }, ...this.#content(item))
  }

  #content(item: LibraryItem): HTMLElement[] {
    const labels = this.#labels()
    const name = html('span', { class: 'name' }, item.name ?? labels.untitled)
    const details = [item.folder, item.updatedAt > 0 ? labels.updated(new Date(item.updatedAt)) : null].filter((part): part is string => part !== null)
    const meta = html('span', { class: 'meta' }, details.join(' · '))
    const parts: HTMLElement[] = [name, meta]
    if (item.classification !== null) parts.push(html('span', { class: 'badge', part: 'badge', 'data-classification': item.classification }, labels.classification[item.classification]))
    return parts
  }

  #activate(index: number): void {
    const before = this.#visible[this.#active]
    if (before !== undefined) this.#options.get(before.id)?.removeAttribute('data-active')
    this.#active = index
    const item = this.#visible[index]
    const option = item === undefined ? undefined : this.#options.get(item.id)
    if (option === undefined) {
      this.list.removeAttribute('aria-activedescendant')
      return
    }
    option.setAttribute('data-active', '')
    this.list.setAttribute('aria-activedescendant', option.id)
    option.scrollIntoView?.({ block: 'nearest' })
  }

  #pick(index: number): void {
    const item = this.#visible[index]
    if (item === undefined) return
    this.#activate(index)
    this.#chosen = item.id
    for (const [id, option] of this.#options) option.setAttribute('aria-selected', id === item.id ? 'true' : 'false')
    this.#choose(item)
  }

  #key(event: KeyboardEvent): void {
    const last = this.#visible.length - 1
    const moves: Record<string, number> = { ArrowDown: Math.min(last, this.#active + 1), ArrowUp: Math.max(0, this.#active - 1), Home: 0, End: last }
    const next = moves[event.key]
    if (next !== undefined) {
      event.preventDefault()
      if (last >= 0) this.#activate(next)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.#pick(this.#active)
    }
  }
}
