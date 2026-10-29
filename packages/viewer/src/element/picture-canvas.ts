import { clampView, dotGridStyle, fitView, isFitView, middleOf, percentOf, zoomAt } from '../core/canvas-view.js'
import type { Point, Size, View } from '../core/canvas-view.js'
import { drillNodeAt, nodeAt, traceOf } from '../core/picture-map.js'
import type { TraceMap } from '../core/picture-map.js'
import type { ViewerLabels } from './copy.js'
import { emit } from './events.js'
import type { Shell } from './shell.js'
import { place, traceLayer } from './trace-layer.js'

/**
 * The picture on its canvas: where it sits and how big it is drawn, the box traced and its overlay, and what a hover or a press
 * means. It holds the picture's map and size, never its text; the element tells it when a picture is shown or cleared.
 */

/** What the canvas needs from the element that holds it. */
export interface CanvasHost {
  /** The element the events are sent from. */
  readonly element: HTMLElement
  readonly shell: Shell
  labels(): ViewerLabels
  /** Says a sentence in the polite live region. */
  say(text: string): void
}

export class PictureCanvas {
  readonly #host: CanvasHost
  #map: TraceMap | null = null
  #size: Size | null = null
  #view: View = { scale: 1, x: 0, y: 0 }
  /** The canvas the view was last set for, and whether the picture is still to be fitted once the canvas has a size. */
  #viewport: Size | null = null
  #pendingFit = true
  #traced: { id: string; pinned: boolean } | null = null
  #layer: SVGSVGElement | null = null

  constructor(host: CanvasHost) {
    this.#host = host
  }

  get view(): View {
    return this.#view
  }

  /**
   * Takes a new picture's map. An update of a picture the same size keeps the view; anything else is fitted once the canvas has a
   * size. The trace is let go of, and its overlay redrawn on the next `settle`.
   */
  setPicture(map: TraceMap, update: boolean): void {
    const size = { width: map.viewBox.width, height: map.viewBox.height }
    const sameSize = this.#size !== null && this.#size.width === size.width && this.#size.height === size.height
    this.#map = map
    this.#size = size
    this.#traced = null
    this.#pendingFit = !(update && sameSize)
  }

  /** Places a picture just set: fits it or keeps the view inside the rules, and redraws the trace. Nothing until the canvas has a size. */
  settle(): void {
    const sizes = this.sizes()
    if (sizes === null) return
    if (this.#pendingFit) this.fit()
    else this.setView(clampView(this.#view, sizes.viewport, sizes.picture))
    this.drawTrace()
  }

  /** Forgets the picture, for one that cannot be shown. */
  clear(): void {
    this.#map = null
    this.#size = null
  }

  sizes(): { viewport: Size; picture: Size } | null {
    if (this.#size === null) return null
    const { clientWidth: width, clientHeight: height } = this.#host.shell.canvas
    return width > 0 && height > 0 ? { viewport: { width, height }, picture: this.#size } : null
  }

  setView(view: View, glide = false): void {
    this.#view = view
    this.#viewport = this.sizes()?.viewport ?? this.#viewport
    const { picture, zoomLevel, canvas } = this.#host.shell
    for (const element of [picture, this.#layer]) {
      if (element === null || this.#size === null) continue
      element.toggleAttribute('data-glide', glide)
      place(element, this.#size, view)
    }
    zoomLevel.value = this.#host.labels().zoomLevel(percentOf(view.scale))
    const grid = dotGridStyle(view)
    canvas.style.backgroundSize = grid.backgroundSize
    canvas.style.backgroundPosition = grid.backgroundPosition
  }

  fit(): void {
    const sizes = this.sizes()
    if (sizes === null) return
    this.#pendingFit = false
    this.setView(fitView(sizes.viewport, sizes.picture), true)
  }

  zoomBy(factor: number): void {
    const sizes = this.sizes()
    if (sizes !== null) this.setView(zoomAt(this.#view, middleOf(sizes.viewport), this.#view.scale * factor, sizes.viewport, sizes.picture), true)
  }

  /** The canvas changed size: a fitted picture stays fitted, any other view is kept inside the rules. */
  resized(): void {
    const sizes = this.sizes()
    if (sizes === null) return
    const wasFitted = this.#viewport !== null && isFitView(this.#view, this.#viewport, sizes.picture)
    if (this.#pendingFit || wasFitted) {
      this.#pendingFit = false
      this.setView(fitView(sizes.viewport, sizes.picture))
    } else this.setView(clampView(this.#view, sizes.viewport, sizes.picture))
  }

  /** A canvas point in the picture's own units. */
  #toPicture(point: Point): Point | null {
    if (this.#map === null) return null
    return { x: (point.x - this.#view.x) / this.#view.scale + this.#map.viewBox.x, y: (point.y - this.#view.y) / this.#view.scale + this.#map.viewBox.y }
  }

  hover(point: Point | null): void {
    const at = point === null ? null : this.#toPicture(point)
    const map = this.#map
    this.#host.shell.canvas.toggleAttribute('data-drill', at !== null && map !== null && drillNodeAt(map, at) !== null)
    if (this.#traced?.pinned === true) return
    this.trace(at === null || map === null ? null : (nodeAt(map, at)?.id ?? null), false)
  }

  press(point: Point): void {
    const at = this.#toPicture(point)
    const map = this.#map
    if (at === null || map === null) return
    const drill = drillNodeAt(map, at)
    if (drill?.part !== undefined) {
      emit(this.#host.element, 'plotwork-drill', { id: drill.id, part: drill.part, name: drill.name })
      this.#host.say(this.#host.labels().drill(drill.name))
      return
    }
    const node = nodeAt(map, at)
    if (node === null || (this.#traced?.pinned === true && this.#traced.id === node.id)) this.trace(null)
    else this.trace(node.id, true)
  }

  trace(id: string | null, pinned = false): void {
    if ((this.#traced?.id ?? null) === id && (this.#traced?.pinned ?? false) === pinned) return
    this.#traced = id === null ? null : { id, pinned }
    this.drawTrace()
    emit(this.#host.element, 'plotwork-trace', { id })
  }

  drawTrace(): void {
    this.#layer?.remove()
    this.#layer = null
    const trace = this.#traced === null || this.#map === null ? null : traceOf(this.#map, this.#traced.id)
    if (trace === null || this.#map === null || this.#size === null) return
    this.#layer = traceLayer(this.#map, trace)
    place(this.#layer, this.#size, this.#view)
    this.#host.shell.canvas.append(this.#layer)
    if (this.#traced?.pinned === true) this.#host.say(this.#host.labels().traced(trace.node.name, trace.lines.length))
  }
}
