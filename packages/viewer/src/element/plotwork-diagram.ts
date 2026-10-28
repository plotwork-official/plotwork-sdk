import { clampView, dotGridStyle, fitView, isFitView, middleOf, percentOf, zoomAt } from '../core/canvas-view.js'
import type { Point, Size, View, WheelMode } from '../core/canvas-view.js'
import { fingerprintOf, isFingerprint } from '../core/fingerprint.js'
import { VIEWER_ZOOM_STEP } from '../core/limits.js'
import { documentHost, liveIntervalOf, watchLive } from '../core/live-watch.js'
import { drillNodeAt, nodeAt, parsePicture, traceMapOf, traceOf } from '../core/picture-map.js'
import type { TraceMap } from '../core/picture-map.js'
import { loadPicture, pictureUrl, PictureLoadError } from '../core/picture-loader.js'
import type { LoadFailure } from '../core/picture-loader.js'
import { drawnScheme, themeChoiceOf, withScheme } from '../core/picture-scheme.js'
import { readEmbeddedSource } from '../core/picture-source.js'
import { mergeLabels } from './copy.js'
import type { ViewerLabels } from './copy.js'
import { emit } from './events.js'
import { attachGestures } from './gestures.js'
import { buildShell } from './shell.js'
import type { Shell } from './shell.js'
import { place, traceLayer } from './trace-layer.js'

/** The attributes the element reads. */
export const OBSERVED_ATTRIBUTES = ['src', 'theme', 'live', 'interval', 'fingerprint', 'wheel', 'label'] as const

/** What a page can call and set on `<plotwork-diagram>`, besides its attributes. */
export interface PlotworkDiagramElement extends HTMLElement {
  /** The picture's text, for a page that already holds it (a bundler import). It wins over `src`. */
  svg: string | null
  /** Words in the page's language, over the English defaults. */
  labels: Partial<ViewerLabels> | undefined
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

/** The element's class, made on first use so that importing the package where there is no `HTMLElement` (a server render) is safe. */
export function createPlotworkDiagramClass(): CustomElementConstructor {
  return class PlotworkDiagram extends HTMLElement implements PlotworkDiagramElement {
    static get observedAttributes(): readonly string[] {
      return OBSERVED_ATTRIBUTES
    }

    #shell: Shell
    #labels: ViewerLabels = mergeLabels(undefined)
    #ownLabels: Partial<ViewerLabels> | undefined
    #svg: string | null = null
    #text: string | null = null
    #fingerprint: string | null = null
    #map: TraceMap | null = null
    #size: Size | null = null
    #view: View = { scale: 1, x: 0, y: 0 }
    /** The canvas the view was last set for, and whether the picture is still to be fitted once the canvas has a size. */
    #viewport: Size | null = null
    #pendingFit = true
    #blob: string | null = null
    #traced: { id: string; pinned: boolean } | null = null
    #layer: SVGSVGElement | null = null
    #loading: AbortController | null = null
    #stopLive: (() => void) | null = null
    #cleanup: (() => void)[] = []
    #hintTimer: ReturnType<typeof setTimeout> | undefined

    constructor() {
      super()
      this.#shell = buildShell(this.attachShadow({ mode: 'open' }), this.#labels)
    }

    connectedCallback(): void {
      /* A property set before the element was defined sits on the instance and hides the accessor: move it onto the accessor. */
      for (const name of ['labels', 'svg'] as const) {
        if (!Object.hasOwn(this, name)) continue
        const value: unknown = (this as Record<string, unknown>)[name]
        delete (this as Record<string, unknown>)[name]
        ;(this as Record<string, unknown>)[name] = value
      }
      const { canvas, zoomIn, zoomOut, fit, fullscreen } = this.#shell
      this.#cleanup.push(
        attachGestures(canvas, {
          view: () => this.#view,
          setView: (view, glide) => this.#setView(view, glide),
          sizes: () => this.#sizes(),
          wheelMode: () => this.#wheelMode(),
          hover: (point) => this.#hover(point),
          press: (point) => this.#press(point),
          hintWheel: () => this.#hintWheel(),
          fit: () => this.fit(),
          release: () => this.#trace(null),
        }),
      )
      const on = (target: EventTarget, type: string, listener: () => void): void => {
        target.addEventListener(type, listener)
        this.#cleanup.push(() => target.removeEventListener(type, listener))
      }
      on(zoomIn, 'click', () => this.zoomIn())
      on(zoomOut, 'click', () => this.zoomOut())
      on(fit, 'click', () => this.fit())
      on(fullscreen, 'click', () => void this.#toggleFullscreen())
      on(document, 'fullscreenchange', () => this.#syncFullscreen())
      const resize = new ResizeObserver(() => this.#resized())
      resize.observe(canvas)
      this.#cleanup.push(() => resize.disconnect())
      const dark = matchMedia('(prefers-color-scheme: dark)')
      on(dark, 'change', () => this.#paintPaper())
      void this.#refresh()
    }

    disconnectedCallback(): void {
      for (const undo of this.#cleanup.splice(0)) undo()
      this.#loading?.abort()
      this.#stopWatching()
      clearTimeout(this.#hintTimer)
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
      this.#svg = typeof value === 'string' && value !== '' ? value : null
      if (this.isConnected) void this.#refresh()
    }

    get labels(): Partial<ViewerLabels> | undefined {
      return this.#ownLabels
    }

    set labels(value: Partial<ViewerLabels> | undefined) {
      this.#ownLabels = value
      this.#labels = mergeLabels(value)
      const { zoomIn, zoomOut, fit, hint } = this.#shell
      for (const [button, label] of [[zoomIn, this.#labels.zoomIn], [zoomOut, this.#labels.zoomOut], [fit, this.#labels.fit]] as const) {
        button.setAttribute('aria-label', label)
        button.title = label
      }
      hint.textContent = this.#labels.wheelHint
      this.#syncFullscreen()
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
      const sizes = this.#sizes()
      if (sizes === null) return
      this.#pendingFit = false
      this.#setView(fitView(sizes.viewport, sizes.picture), true)
    }

    zoomIn(): void {
      this.#zoomBy(VIEWER_ZOOM_STEP)
    }

    zoomOut(): void {
      this.#zoomBy(1 / VIEWER_ZOOM_STEP)
    }

    async reload(): Promise<void> {
      await this.#refresh(true)
    }

    /* Loading. */

    async #refresh(revalidate = false): Promise<void> {
      this.#loading?.abort()
      const loading = new AbortController()
      this.#loading = loading
      try {
        const text = this.#svg ?? (await this.#fetch(loading.signal, revalidate))
        if (loading.signal.aborted) return
        if (text === null) return this.#fail('empty')
        await this.#show(text, revalidate && this.#fingerprint !== null)
      } catch (error) {
        if (!loading.signal.aborted) this.#fail(error instanceof PictureLoadError ? error.reason : 'network')
      }
      this.#watch()
    }

    async #fetch(signal: AbortSignal, revalidate: boolean): Promise<string | null> {
      const src = this.getAttribute('src')
      if (src === null || src.trim() === '') return null
      const url = pictureUrl(src, document.baseURI)
      if (url === null) throw new PictureLoadError('address')
      return loadPicture(url, { signal, revalidate })
    }

    /** Shows a picture's text. An update keeps the view when the picture is the same size; a first showing fits it. */
    async #show(text: string, update: boolean): Promise<void> {
      const fingerprint = await fingerprintOf(text)
      const pinned = this.getAttribute('fingerprint')
      if (pinned !== null && isFingerprint(pinned) && pinned !== fingerprint) throw new PictureLoadError('fingerprint')
      if (update && fingerprint === this.#fingerprint) return
      const root = parsePicture(text)
      const map = root === null ? null : traceMapOf(root)
      if (map === null) throw new PictureLoadError('not-a-picture')

      const previous = this.#fingerprint
      const size = { width: map.viewBox.width, height: map.viewBox.height }
      const sameSize = this.#size !== null && this.#size.width === size.width && this.#size.height === size.height
      this.#text = text
      this.#fingerprint = fingerprint
      this.#map = map
      this.#size = size
      this.#traced = null
      this.#paintPicture(text)
      const { picture, canvas, notice, toolbar } = this.#shell
      picture.hidden = false
      notice.hidden = true
      toolbar.hidden = false
      canvas.setAttribute('aria-busy', 'false')
      this.#describe()
      const sizes = this.#sizes()
      this.#pendingFit = !(update && sameSize)
      if (sizes === null) return void this.#announceShown(update, previous, fingerprint, text)
      if (this.#pendingFit) this.fit()
      else this.#setView(clampView(this.#view, sizes.viewport, sizes.picture))
      this.#drawTrace()
      this.#announceShown(update, previous, fingerprint, text)
    }

    #announceShown(update: boolean, previous: string | null, fingerprint: string, text: string): void {
      if (update && previous !== null) {
        this.#say(this.#labels.updated)
        emit(this, 'plotwork-change', { fingerprint, previous })
      } else emit(this, 'plotwork-load', { fingerprint, hasSource: readEmbeddedSource(text).status === 'found' })
    }

    /** Points the `img` at the picture in the scheme asked for, and paints the paper to match. */
    #paintPicture(text: string): void {
      this.#paintPaper()
      const blob = URL.createObjectURL(new Blob([withScheme(text, themeChoiceOf(this.getAttribute('theme')))], { type: 'image/svg+xml' }))
      this.#shell.picture.src = blob
      if (this.#blob !== null) URL.revokeObjectURL(this.#blob)
      this.#blob = blob
    }

    #fail(reason: LoadFailure | 'empty'): void {
      const { picture, notice, toolbar, canvas } = this.#shell
      this.#text = null
      this.#fingerprint = null
      this.#map = null
      this.#size = null
      picture.hidden = true
      picture.removeAttribute('src')
      if (this.#blob !== null) URL.revokeObjectURL(this.#blob)
      this.#blob = null
      notice.textContent = this.#labels.failed[reason]
      notice.hidden = false
      toolbar.hidden = true
      canvas.setAttribute('aria-busy', 'false')
      this.#drawTrace()
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

    /* The canvas. */

    #sizes(): { viewport: Size; picture: Size } | null {
      if (this.#size === null) return null
      const { clientWidth: width, clientHeight: height } = this.#shell.canvas
      return width > 0 && height > 0 ? { viewport: { width, height }, picture: this.#size } : null
    }

    #wheelMode(): WheelMode {
      return document.fullscreenElement === this || this.getAttribute('wheel') === 'zoom' ? 'zoom' : 'modifier'
    }

    #setView(view: View, glide = false): void {
      this.#view = view
      this.#viewport = this.#sizes()?.viewport ?? this.#viewport
      const { picture, zoomLevel } = this.#shell
      for (const element of [picture, this.#layer]) {
        if (element === null || this.#size === null) continue
        element.toggleAttribute('data-glide', glide)
        place(element, this.#size, view)
      }
      zoomLevel.value = this.#labels.zoomLevel(percentOf(view.scale))
      const grid = dotGridStyle(view)
      this.#shell.canvas.style.backgroundSize = grid.backgroundSize
      this.#shell.canvas.style.backgroundPosition = grid.backgroundPosition
    }

    #zoomBy(factor: number): void {
      const sizes = this.#sizes()
      if (sizes !== null) this.#setView(zoomAt(this.#view, middleOf(sizes.viewport), this.#view.scale * factor, sizes.viewport, sizes.picture), true)
    }

    #resized(): void {
      const sizes = this.#sizes()
      if (sizes === null) return
      const wasFitted = this.#viewport !== null && isFitView(this.#view, this.#viewport, sizes.picture)
      if (this.#pendingFit || wasFitted) {
        this.#pendingFit = false
        this.#setView(fitView(sizes.viewport, sizes.picture))
      } else this.#setView(clampView(this.#view, sizes.viewport, sizes.picture))
    }

    /** A canvas point in the picture's own units. */
    #toPicture(point: Point): Point | null {
      if (this.#map === null) return null
      return { x: (point.x - this.#view.x) / this.#view.scale + this.#map.viewBox.x, y: (point.y - this.#view.y) / this.#view.scale + this.#map.viewBox.y }
    }

    #hover(point: Point | null): void {
      const at = point === null ? null : this.#toPicture(point)
      const map = this.#map
      this.#shell.canvas.toggleAttribute('data-drill', at !== null && map !== null && drillNodeAt(map, at) !== null)
      if (this.#traced?.pinned === true) return
      this.#trace(at === null || map === null ? null : (nodeAt(map, at)?.id ?? null), false)
    }

    #press(point: Point): void {
      const at = this.#toPicture(point)
      const map = this.#map
      if (at === null || map === null) return
      const drill = drillNodeAt(map, at)
      if (drill?.part !== undefined) {
        emit(this, 'plotwork-drill', { id: drill.id, part: drill.part, name: drill.name })
        this.#say(this.#labels.drill(drill.name))
        return
      }
      const node = nodeAt(map, at)
      if (node === null || (this.#traced?.pinned === true && this.#traced.id === node.id)) this.#trace(null)
      else this.#trace(node.id, true)
    }

    #trace(id: string | null, pinned = false): void {
      if ((this.#traced?.id ?? null) === id && (this.#traced?.pinned ?? false) === pinned) return
      this.#traced = id === null ? null : { id, pinned }
      this.#drawTrace()
      emit(this, 'plotwork-trace', { id })
    }

    #drawTrace(): void {
      this.#layer?.remove()
      this.#layer = null
      const trace = this.#traced === null || this.#map === null ? null : traceOf(this.#map, this.#traced.id)
      if (trace === null || this.#map === null || this.#size === null) return
      this.#layer = traceLayer(this.#map, trace)
      place(this.#layer, this.#size, this.#view)
      this.#shell.canvas.append(this.#layer)
      if (this.#traced?.pinned === true) this.#say(this.#labels.traced(trace.node.name, trace.lines.length))
    }

    /* Everything else the element shows. */

    /** The paper behind the picture: the scheme it was drawn in, else the one asked for, else the page's. */
    #paintPaper(): void {
      const choice = themeChoiceOf(this.getAttribute('theme'))
      const drawn = this.#text === null ? null : drawnScheme(this.#text)
      const paper = drawn ?? (choice === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : choice)
      this.setAttribute('data-paper', paper)
    }

    #describe(): void {
      const label = this.getAttribute('label')
      this.#shell.canvas.setAttribute('aria-label', label === null || label.trim() === '' ? this.#labels.canvas : `${label}. ${this.#labels.canvas}`)
    }

    #say(text: string): void {
      this.#shell.live.textContent = text
    }

    #hintWheel(): void {
      const { hint } = this.#shell
      hint.setAttribute('data-shown', '')
      clearTimeout(this.#hintTimer)
      this.#hintTimer = setTimeout(() => hint.removeAttribute('data-shown'), 1500)
    }

    async #toggleFullscreen(): Promise<void> {
      try {
        if (document.fullscreenElement === this) await document.exitFullscreen()
        else await this.requestFullscreen()
      } catch {
        // Full screen refused (an iframe without permission): the button simply does nothing.
      }
    }

    #syncFullscreen(): void {
      const label = document.fullscreenElement === this ? this.#labels.exitFullscreen : this.#labels.fullscreen
      this.#shell.fullscreen.setAttribute('aria-label', label)
      this.#shell.fullscreen.title = label
    }
  }
}
