import type { Fetcher, TokenSource } from '../core/access.js'
import type { WheelMode } from '../core/canvas-view.js'
import { VIEWER_ZOOM_STEP } from '../core/limits.js'
import { documentHost, liveIntervalOf, watchLive } from '../core/live-watch.js'
import { PictureLoadError } from '../core/picture-loader.js'
import type { LoadFailure } from '../core/picture-loader.js'
import { readEmbeddedSource } from '../core/picture-source.js'
import { describeCanvas, labelControls, paintPaper, PictureImage, syncFullscreen, toggleFullscreen, WheelHint } from './chrome.js'
import { mergeLabels } from './copy.js'
import type { ViewerLabels } from './copy.js'
import { emit } from './events.js'
import { attachGestures } from './gestures.js'
import { fetchPictureText, readPicture } from './loading.js'
import { PictureCanvas } from './picture-canvas.js'
import { buildShell } from './shell.js'
import type { Shell } from './shell.js'

/** The attributes the element reads. */
export const OBSERVED_ATTRIBUTES = ['src', 'theme', 'live', 'interval', 'fingerprint', 'wheel', 'label'] as const

/** What a page can call and set on `<plotwork-diagram>`, besides its attributes. */
export interface PlotworkDiagramElement extends HTMLElement {
  /** The picture's text, for a page that already holds it (a bundler import). It wins over `src`. */
  svg: string | null
  /** Words in the page's language, over the English defaults. */
  labels: Partial<ViewerLabels> | undefined
  /**
   * A token from Sign in with Plotwork, or a function that gives the current one, sent as `Authorization: Bearer` with every request
   * for `src`: what a picture of the library (`/v1/library/{id}.svg`) needs. Only to https, or http on this computer.
   */
  token: TokenSource | null
  /** The `fetch` the element calls for `src` and live checks, with the same options (`cache`, `credentials: 'omit'`, the signal). */
  fetch: Fetcher | null
  /** The fingerprint of the picture shown, or null. */
  readonly fingerprint: string | null
  /** The source the picture carries, or null when it carries none. */
  source(): string | null
  fit(): void
  zoomIn(): void
  zoomOut(): void
  /** Loads the picture again, checking the server's copy. */
  reload(): Promise<void>
}

/**
 * The element's class, made on first use so that importing the package where there is no `HTMLElement` (a server render) is safe.
 * It holds the picture's text and fingerprint, loads and watches it, and wires the shell; the canvas (`picture-canvas.ts`) holds the
 * view and the trace, and `chrome.ts` paints what surrounds the picture.
 */
export function createPlotworkDiagramClass(): CustomElementConstructor {
  return class PlotworkDiagram extends HTMLElement implements PlotworkDiagramElement {
    static get observedAttributes(): readonly string[] {
      return OBSERVED_ATTRIBUTES
    }

    #shell: Shell
    #canvas: PictureCanvas
    #image: PictureImage
    #hint: WheelHint
    #labels: ViewerLabels = mergeLabels(undefined)
    #ownLabels: Partial<ViewerLabels> | undefined
    #svg: string | null = null
    #token: TokenSource | null = null
    #fetcher: Fetcher | null = null
    #failed = false
    #text: string | null = null
    #fingerprint: string | null = null
    #loading: AbortController | null = null
    #stopLive: (() => void) | null = null
    #cleanup: (() => void)[] = []

    constructor() {
      super()
      this.#shell = buildShell(this.attachShadow({ mode: 'open' }), this.#labels)
      this.#canvas = new PictureCanvas({ element: this, shell: this.#shell, labels: () => this.#labels, say: (text) => this.#say(text) })
      this.#image = new PictureImage(this.#shell.picture)
      this.#hint = new WheelHint(this.#shell.hint)
    }

    connectedCallback(): void {
      /* A property set before the element was defined sits on the instance and hides the accessor: move it onto the accessor. */
      for (const name of ['labels', 'svg', 'token', 'fetch'] as const) {
        if (!Object.hasOwn(this, name)) continue
        const value: unknown = (this as Record<string, unknown>)[name]
        delete (this as Record<string, unknown>)[name]
        ;(this as Record<string, unknown>)[name] = value
      }
      const { canvas, zoomIn, zoomOut, fit, fullscreen } = this.#shell
      const view = this.#canvas
      this.#cleanup.push(
        attachGestures(canvas, {
          view: () => view.view,
          setView: (next, glide) => view.setView(next, glide),
          sizes: () => view.sizes(),
          wheelMode: () => this.#wheelMode(),
          hover: (point) => view.hover(point),
          press: (point) => view.press(point),
          hintWheel: () => this.#hint.show(),
          fit: () => this.fit(),
          release: () => view.trace(null),
        }),
      )
      const on = (target: EventTarget, type: string, listener: () => void): void => {
        target.addEventListener(type, listener)
        this.#cleanup.push(() => target.removeEventListener(type, listener))
      }
      on(zoomIn, 'click', () => this.zoomIn())
      on(zoomOut, 'click', () => this.zoomOut())
      on(fit, 'click', () => this.fit())
      on(fullscreen, 'click', () => void toggleFullscreen(this))
      on(document, 'fullscreenchange', () => syncFullscreen(this, this.#shell, this.#labels))
      const resize = new ResizeObserver(() => view.resized())
      resize.observe(canvas)
      this.#cleanup.push(() => resize.disconnect())
      const dark = matchMedia('(prefers-color-scheme: dark)')
      on(dark, 'change', () => paintPaper(this, this.#text))
      void this.#refresh()
    }

    disconnectedCallback(): void {
      for (const undo of this.#cleanup.splice(0)) undo()
      this.#loading?.abort()
      this.#stopWatching()
      this.#hint.stop()
    }

    attributeChangedCallback(name: string, before: string | null, after: string | null): void {
      if (before === after || !this.isConnected) return
      if (name === 'label') this.#describe()
      else if (name === 'wheel') return
      else if (name === 'theme' && this.#text !== null) this.#paintPicture(this.#text)
      else if (name === 'live' || name === 'interval') this.#watch()
      else void this.#refresh()
    }

    get svg(): string | null {
      return this.#svg
    }

    set svg(value: string | null) {
      const next = typeof value === 'string' && value !== '' ? value : null
      if (next === this.#svg) return
      this.#svg = next
      if (this.isConnected) void this.#refresh(false, this.#svg !== null)
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

    /** A token or a `fetch` given after a load failed (a 401 before sign-in) loads again. A picture shown stays until its next check. */
    #retryAfterAccess(): void {
      if (this.isConnected && this.#failed && this.#svg === null) void this.#refresh()
    }

    get labels(): Partial<ViewerLabels> | undefined {
      return this.#ownLabels
    }

    set labels(value: Partial<ViewerLabels> | undefined) {
      this.#ownLabels = value
      this.#labels = mergeLabels(value)
      labelControls(this.#shell, this.#labels)
      syncFullscreen(this, this.#shell, this.#labels)
      this.#describe()
    }

    get fingerprint(): string | null {
      return this.#fingerprint
    }

    source(): string | null {
      if (this.#text === null) return null
      const reading = readEmbeddedSource(this.#text)
      return reading.status === 'found' ? reading.source : null
    }

    fit(): void {
      this.#canvas.fit()
    }

    zoomIn(): void {
      this.#canvas.zoomBy(VIEWER_ZOOM_STEP)
    }

    zoomOut(): void {
      this.#canvas.zoomBy(1 / VIEWER_ZOOM_STEP)
    }

    async reload(): Promise<void> {
      await this.#refresh(true)
    }

    /**
     * Loads the picture again. `update` says the new text is a new version of the picture shown (a revalidation, or `svg` set while
     * a picture is shown, as a bundler's hot reload does): it keeps the view and sends `plotwork-change` instead of `plotwork-load`.
     */
    async #refresh(revalidate = false, update = revalidate): Promise<void> {
      this.#loading?.abort()
      const loading = new AbortController()
      this.#loading = loading
      try {
        const text = this.#svg ?? (await this.#fetch(loading.signal, revalidate))
        if (loading.signal.aborted) return
        if (text === null) return this.#fail('empty')
        await this.#show(text, update && this.#fingerprint !== null)
      } catch (error) {
        if (!loading.signal.aborted) this.#fail(error instanceof PictureLoadError ? error.reason : 'network')
      }
      this.#watch()
    }

    async #fetch(signal: AbortSignal, revalidate: boolean): Promise<string | null> {
      // One microtask first, so a token or fetch a framework sets just after it connects the element (React's layout effects) is used.
      await Promise.resolve()
      if (signal.aborted) return null
      return fetchPictureText(this.getAttribute('src'), document.baseURI, signal, revalidate, { token: this.#token, fetch: this.#fetcher })
    }

    /** Shows a picture's text. An update keeps the view when the picture is the same size; a first showing fits it. */
    async #show(text: string, update: boolean): Promise<void> {
      const reading = await readPicture(text, this.getAttribute('fingerprint'), update ? this.#fingerprint : null)
      if (reading === null) return
      const previous = this.#fingerprint
      const { fingerprint } = reading
      this.#text = text
      this.#fingerprint = fingerprint
      this.#failed = false
      this.#canvas.setPicture(reading.map, update)
      this.#paintPicture(text)
      const { picture, canvas, notice, toolbar } = this.#shell
      picture.hidden = false
      notice.hidden = true
      toolbar.hidden = false
      canvas.setAttribute('aria-busy', 'false')
      this.#describe()
      this.#canvas.settle()
      if (update && previous !== null) {
        this.#say(this.#labels.updated)
        emit(this, 'plotwork-change', { fingerprint, previous })
      } else emit(this, 'plotwork-load', { fingerprint, hasSource: readEmbeddedSource(text).status === 'found' })
    }

    /** Points the `img` at the picture in the scheme asked for, and paints the paper to match. */
    #paintPicture(text: string): void {
      paintPaper(this, this.#text)
      this.#image.show(text, this.getAttribute('theme'))
    }

    #fail(reason: LoadFailure | 'empty'): void {
      const { picture, notice, toolbar, canvas } = this.#shell
      this.#text = null
      this.#fingerprint = null
      this.#failed = true
      this.#canvas.clear()
      picture.hidden = true
      this.#image.clear()
      notice.textContent = this.#labels.failed[reason]
      notice.hidden = false
      toolbar.hidden = true
      canvas.setAttribute('aria-busy', 'false')
      this.#canvas.drawTrace()
      emit(this, 'plotwork-error', { reason })
    }

    /** Watches a live picture: only with `live`, a `src`, a picture shown, and no pinned fingerprint. */
    #watch(): void {
      this.#stopWatching()
      if (!this.hasAttribute('live') || this.#svg !== null || this.hasAttribute('fingerprint') || this.#fingerprint === null) return
      this.#stopLive = watchLive(documentHost(document), liveIntervalOf(this.getAttribute('interval')), async () => {
        const text = await this.#fetch(new AbortController().signal, true)
        if (text !== null) await this.#show(text, true)
      })
    }

    #stopWatching(): void {
      this.#stopLive?.()
      this.#stopLive = null
    }

    #wheelMode(): WheelMode {
      return document.fullscreenElement === this || this.getAttribute('wheel') === 'zoom' ? 'zoom' : 'modifier'
    }

    #describe(): void {
      describeCanvas(this.#shell, this.getAttribute('label'), this.#labels)
    }

    #say(text: string): void {
      this.#shell.live.textContent = text
    }
  }
}
