import { middleOf, mouseWheelZoomFactor, panBy, pinchView, toggledScale, wheelIntent, wheelPixels, wheelZoomFactor, zoomAt, isMouseWheel } from '../core/canvas-view.js'
import type { Point, Size, View, WheelMode } from '../core/canvas-view.js'
import { PRESS_SLOP_PX, VIEWER_PAN_STEP, VIEWER_ZOOM_STEP } from '../core/limits.js'

/**
 * What moves the picture: the wheel, a drag, a two-finger pinch, a double press, and the keys. Every handler reads the latest view
 * from the controller, because a pointer reports several times a frame, and hands back a view the arithmetic already held inside
 * the rules. A press that did not move counts as a press, so the element can trace or drill.
 */

/** What the gestures need from the element. */
export interface CanvasController {
  view(): View
  setView(view: View, glide?: boolean): void
  /** The canvas and the picture, or null before the picture has a size. */
  sizes(): { viewport: Size; picture: Size } | null
  wheelMode(): WheelMode
  /** The pointer is over this canvas point, or has left (null). */
  hover(point: Point | null): void
  /** A press that did not move, at this canvas point. */
  press(point: Point): void
  /** A plain wheel was left to the page: tell the reader how to zoom. */
  hintWheel(): void
  fit(): void
  /** Escape: let go of a trace. */
  release(): void
}

/** Wires the gestures to a canvas; the function it returns removes them. */
export function attachGestures(canvas: HTMLElement, control: CanvasController): () => void {
  const pointers = new Map<number, Point>()
  let drag: { start: Point; last: Point; moved: boolean } | null = null
  let pinch: { view: View; mid: Point; distance: number } | null = null

  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const pair = (): { mid: Point; distance: number } | null => {
    const [a, b] = [...pointers.values()]
    if (a === undefined || b === undefined) return null
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) }
  }

  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    try {
      canvas.setPointerCapture?.(event.pointerId)
    } catch {
      // The pointer is already gone (lifted, or not a real pointer): a drag without capture still works inside the canvas.
    }
    const point = local(event)
    pointers.set(event.pointerId, point)
    const both = pair()
    if (both !== null) {
      pinch = { view: control.view(), ...both }
      drag = null
    } else drag = { start: point, last: point, moved: false }
  }

  const onMove = (event: PointerEvent): void => {
    const point = local(event)
    if (!pointers.has(event.pointerId)) {
      if (event.pointerType !== 'touch') control.hover(point)
      return
    }
    pointers.set(event.pointerId, point)
    const sizes = control.sizes()
    if (sizes === null) return
    const both = pair()
    if (pinch !== null && both !== null) {
      control.setView(pinchView(pinch, both, sizes.viewport, sizes.picture))
      return
    }
    if (drag === null) return
    if (!drag.moved && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < PRESS_SLOP_PX) return
    if (!drag.moved) canvas.setAttribute('data-dragging', '')
    drag.moved = true
    control.setView(panBy(control.view(), point.x - drag.last.x, point.y - drag.last.y, sizes.viewport, sizes.picture))
    drag.last = point
  }

  const onUp = (event: PointerEvent): void => {
    if (!pointers.delete(event.pointerId)) return
    if (drag !== null && !drag.moved && pinch === null) control.press(local(event))
    if (pointers.size < 2) pinch = null
    drag = null
    canvas.removeAttribute('data-dragging')
  }

  const onLeave = (): void => {
    if (pointers.size === 0) control.hover(null)
  }

  const onWheel = (event: WheelEvent): void => {
    const sizes = control.sizes()
    if (sizes === null) return
    const intent = wheelIntent(event, control.wheelMode())
    if (intent === 'page') {
      control.hintWheel()
      return
    }
    event.preventDefault()
    const view = control.view()
    if (intent === 'pan') {
      control.setView(panBy(view, -wheelPixels(event.deltaX, event.deltaMode, sizes.viewport.width), -wheelPixels(event.deltaY, event.deltaMode, sizes.viewport.height), sizes.viewport, sizes.picture))
      return
    }
    const delta = wheelPixels(event.deltaY, event.deltaMode, sizes.viewport.height)
    const factor = isMouseWheel(event) && !event.ctrlKey ? mouseWheelZoomFactor(delta) : wheelZoomFactor(delta)
    control.setView(zoomAt(view, local(event), view.scale * factor, sizes.viewport, sizes.picture))
  }

  const onDouble = (event: MouseEvent): void => {
    const sizes = control.sizes()
    if (sizes === null) return
    const view = control.view()
    control.setView(zoomAt(view, local(event), toggledScale(view, sizes.viewport, sizes.picture), sizes.viewport, sizes.picture), true)
  }

  const onKey = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const sizes = control.sizes()
    if (sizes === null) return
    const view = control.view()
    const zoom = (factor: number): void => control.setView(zoomAt(view, middleOf(sizes.viewport), view.scale * factor, sizes.viewport, sizes.picture), true)
    const pan = (dx: number, dy: number): void => control.setView(panBy(view, dx, dy, sizes.viewport, sizes.picture), true)
    const keys: Record<string, () => void> = {
      '+': () => zoom(VIEWER_ZOOM_STEP),
      '=': () => zoom(VIEWER_ZOOM_STEP),
      '-': () => zoom(1 / VIEWER_ZOOM_STEP),
      '0': () => control.fit(),
      ArrowLeft: () => pan(VIEWER_PAN_STEP, 0),
      ArrowRight: () => pan(-VIEWER_PAN_STEP, 0),
      ArrowUp: () => pan(0, VIEWER_PAN_STEP),
      ArrowDown: () => pan(0, -VIEWER_PAN_STEP),
      Escape: () => control.release(),
    }
    const action = keys[event.key]
    if (action === undefined) return
    event.preventDefault()
    action()
  }

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('dblclick', onDouble)
  canvas.addEventListener('keydown', onKey)
  return () => {
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    canvas.removeEventListener('pointerleave', onLeave)
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('dblclick', onDouble)
    canvas.removeEventListener('keydown', onKey)
  }
}
