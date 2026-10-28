import { VIEWER_MAX_ZOOM, VIEWER_MIN_ZOOM, VIEWER_PADDING } from './limits.js'

/**
 * The arithmetic of the viewer's canvas, with no browser in it: where the picture sits and how big it is drawn, for a
 * canvas of a given size. A view is the picture's top left corner in the canvas (`x`, `y`, in pixels) and the factor it is
 * drawn at (`scale`, 1 is the picture's own size). Every function takes a view and gives a new one that is already inside
 * the rules, so the component that moves the picture never has to check them.
 *
 * The rules: the zoom is between 10 percent and 800 percent; the fit zoom is never above 100 percent, so a small diagram
 * is not blown up to fill the window; the fitted picture is centred, except down a portrait canvas (a phone held upright), where
 * it sits at the top so the space a short diagram leaves is below it, not above; a drag moves the picture freely at any zoom,
 * until only a strip of it (`KEEP_PX`) is left in the canvas, so it can always be grabbed again.
 */

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface View {
  scale: number
  x: number
  y: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** How many pixels of the picture stay in the canvas however far it is dragged, so it can always be grabbed and brought back. */
export const KEEP_PX = 96

/** True when a canvas and a picture both have a size to work with. Before the picture has loaded, or in a window with no layout, they do not. */
export function hasRoom(viewport: Size, picture: Size): boolean {
  return viewport.width > 0 && viewport.height > 0 && picture.width > 0 && picture.height > 0
}

/** The zoom at which the whole picture is in the canvas with some air around it. Never above 1, so a small picture stays its own size. */
export function fitScale(viewport: Size, picture: Size): number {
  if (!hasRoom(viewport, picture)) return 1
  const across = Math.max(1, viewport.width - VIEWER_PADDING * 2) / picture.width
  const down = Math.max(1, viewport.height - VIEWER_PADDING * 2) / picture.height
  return Math.min(1, across, down)
}

/**
 * The smallest and largest zoom. The smallest is 10 percent, or the fit zoom when a very large picture needs less than that
 * to be seen whole, so Fit is always reachable.
 */
export function zoomLimits(fit: number): { min: number; max: number } {
  return { min: Math.min(VIEWER_MIN_ZOOM, fit), max: VIEWER_MAX_ZOOM }
}

/** A zoom held inside the limits. */
export function clampScale(scale: number, fit: number): number {
  const { min, max } = zoomLimits(fit)
  return clamp(scale, min, max)
}

/**
 * Where one axis of the picture may sit: centred when it fits (or at the start, past the air, when `top` is set), else free
 * between the two edges plus the air.
 */
function settle(offset: number, extent: number, size: number): number {
  const keep = Math.min(KEEP_PX, size, extent)
  return clamp(offset, keep - size, extent - keep)
}

/** True for a canvas taller than it is wide: a phone held upright, where a centred picture would leave a gap above it. */
export function isPortrait(viewport: Size): boolean {
  return viewport.height > viewport.width
}

/** A view moved inside the rules for this canvas and picture. */
export function clampView(view: View, viewport: Size, picture: Size): View {
  if (!hasRoom(viewport, picture)) return view
  return {
    scale: view.scale,
    x: settle(view.x, viewport.width, picture.width * view.scale),
    y: settle(view.y, viewport.height, picture.height * view.scale),
  }
}

/** The picture at this zoom, centred in the canvas (at the top of a portrait one, when it fits down it). */
export function centred(scale: number, viewport: Size, picture: Size): View {
  const height = picture.height * scale
  const top = isPortrait(viewport) && height + VIEWER_PADDING * 2 <= viewport.height
  return clampView({ scale, x: (viewport.width - picture.width * scale) / 2, y: top ? VIEWER_PADDING : (viewport.height - height) / 2 }, viewport, picture)
}

/** The picture fitted to the canvas and centred (at the top of a portrait one). */
export function fitView(viewport: Size, picture: Size): View {
  return centred(fitScale(viewport, picture), viewport, picture)
}

/** The picture moved by `dx` and `dy` pixels. */
export function panBy(view: View, dx: number, dy: number, viewport: Size, picture: Size): View {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, viewport, picture)
}

/**
 * The picture at a new zoom, with the spot under `point` (in canvas pixels) staying under it: zooming with the pointer
 * over a detail keeps the detail under the pointer. The zoom is held inside the limits first.
 */
export function zoomAt(view: View, point: Point, scale: number, viewport: Size, picture: Size): View {
  const next = clampScale(scale, fitScale(viewport, picture))
  const ratio = next / view.scale
  return clampView({ scale: next, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }, viewport, picture)
}

/**
 * The view that shows a box of the picture (in the picture's own units): unchanged when the box is already whole in the canvas,
 * else moved, at the same zoom, so the box is in the middle. Stepping from box to box with the keyboard never leaves one out of sight.
 */
export function revealed(view: View, box: { x: number; y: number; width: number; height: number }, viewport: Size, picture: Size): View {
  const left = view.x + box.x * view.scale
  const top = view.y + box.y * view.scale
  const right = left + box.width * view.scale
  const bottom = top + box.height * view.scale
  if (left >= 0 && top >= 0 && right <= viewport.width && bottom <= viewport.height) return view
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  return clampView({ ...view, x: viewport.width / 2 - middle.x * view.scale, y: viewport.height / 2 - middle.y * view.scale }, viewport, picture)
}

/** The largest zoom Zoom to selection goes to: close enough to read, never so close one box fills the window. */
export const BOX_ZOOM_MAX = 2

/** The view that shows a box of the picture whole and centred, as large as fits up to `max` (`BOX_ZOOM_MAX`), for Zoom to selection. */
export function boxView(box: { x: number; y: number; width: number; height: number }, viewport: Size, picture: Size, max: number = BOX_ZOOM_MAX): View {
  if (!hasRoom(viewport, picture) || box.width <= 0 || box.height <= 0) return fitView(viewport, picture)
  const across = Math.max(1, viewport.width - VIEWER_PADDING * 4) / box.width
  const down = Math.max(1, viewport.height - VIEWER_PADDING * 4) / box.height
  const scale = clampScale(Math.min(across, down, max), fitScale(viewport, picture))
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  return clampView({ scale, x: viewport.width / 2 - middle.x * scale, y: viewport.height / 2 - middle.y * scale }, viewport, picture)
}

/** The middle of the canvas, where a zoom button or key zooms around. */
export function middleOf(viewport: Size): Point {
  return { x: viewport.width / 2, y: viewport.height / 2 }
}

/**
 * The view while two fingers are down. The spot of the picture that was under the fingers' midpoint when they landed stays
 * under their midpoint as it moves, and the zoom follows the distance between them, so a pinch zooms and a drag with two
 * fingers pans, in one gesture.
 */
export function pinchView(start: { view: View; mid: Point; distance: number }, now: { mid: Point; distance: number }, viewport: Size, picture: Size): View {
  const fit = fitScale(viewport, picture)
  const ratio = start.distance > 0 ? now.distance / start.distance : 1
  const scale = clampScale(start.view.scale * ratio, fit)
  const spot = { x: (start.mid.x - start.view.x) / start.view.scale, y: (start.mid.y - start.view.y) / start.view.scale }
  return clampView({ scale, x: now.mid.x - spot.x * scale, y: now.mid.y - spot.y * scale }, viewport, picture)
}

/** How near the fit zoom a zoom has to be to count as fitted: a hair, so a rounding difference is not "zoomed". */
const FIT_TOLERANCE = 0.002

/** True when the view is the fitted one, so a refit on resize is right and a double press means "zoom in". */
export function isFitted(view: View, viewport: Size, picture: Size): boolean {
  return Math.abs(view.scale - fitScale(viewport, picture)) < FIT_TOLERANCE
}

/** True when the view is the fitted view itself, at the fit zoom and in its place, not one moved away from it by a drag. */
export function isFitView(view: View, viewport: Size, picture: Size): boolean {
  const fit = fitView(viewport, picture)
  return isFitted(view, viewport, picture) && Math.abs(view.x - fit.x) < 0.5 && Math.abs(view.y - fit.y) < 0.5
}

/** What a double press does: from fitted, to 100 percent (or to 200 percent when the picture already fits at 100); from anything else, back to fit. */
export function toggledScale(view: View, viewport: Size, picture: Size): number {
  const fit = fitScale(viewport, picture)
  if (!isFitted(view, viewport, picture)) return fit
  return fit < 1 ? 1 : 2
}

/** The zoom as the whole percent a person reads. */
export function percentOf(scale: number): number {
  return Math.round(scale * 100)
}

/** How much a wheel turn zooms: smooth for a trackpad's pinch (small steps), and capped so a mouse wheel's notch is a step, not a leap. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-clamp(deltaY, -60, 60) * 0.008)
}

/**
 * What a plain wheel does over a canvas. `zoom` is for a canvas that is the page (the editor, a viewer that fills the window or is in
 * full screen): the wheel zooms. `modifier` is for a canvas inside a page that scrolls: the wheel scrolls the page, and only Control or
 * Command with the wheel zooms.
 */
export type WheelMode = 'zoom' | 'modifier'

/** What one wheel event is for: zooming at the pointer, moving the picture, or the page's own scroll. */
export type WheelIntent = 'zoom' | 'pan' | 'page'

/** The least a mouse notch moves in pixels. A trackpad sends many smaller events instead. */
const MOUSE_NOTCH_PX = 40

/**
 * Whether a wheel event came from a mouse's wheel rather than a two-finger swipe on a trackpad. Browsers do not say, so this reads
 * the shape of the event: a mouse wheel reports lines or pages (`deltaMode` 1 or 2), or whole pixels in steps of a notch on one axis
 * only. A swipe reports pixels, often fractional, often small, and often with a sideways part. A slow swipe that looks like a notch is
 * read as a mouse and zooms, which is the safer of the two mistakes on a full-window canvas.
 */
export function isMouseWheel(event: { deltaX: number; deltaY: number; deltaMode: number }): boolean {
  if (event.deltaMode !== 0) return true
  return event.deltaX === 0 && Number.isInteger(event.deltaY) && Math.abs(event.deltaY) >= MOUSE_NOTCH_PX
}

/**
 * What a wheel event does. Control or Command with the wheel (and a trackpad's pinch, which arrives that way) always zooms. With
 * neither, a `zoom` canvas zooms for a mouse wheel and moves the picture for a trackpad swipe, so a trackpad can still get about;
 * a `modifier` canvas leaves the wheel to the page.
 */
export function wheelIntent(event: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean }, mode: WheelMode): WheelIntent {
  if (event.ctrlKey || event.metaKey) return 'zoom'
  if (mode === 'modifier') return 'page'
  return isMouseWheel(event) ? 'zoom' : 'pan'
}

/**
 * What one turn of a mouse wheel multiplies the zoom by: proportional to how far it turned, so a notch (about 100 pixels) is close to
 * a press of a zoom button and a fast spin is a few of them, never a leap.
 */
export function mouseWheelZoomFactor(deltaY: number): number {
  return Math.exp(-clamp(deltaY, -240, 240) * 0.0022)
}

/** The dot grid's step at 100 percent, in pixels: the portal's own `--canvas-step` (1.5rem). */
export const DOT_STEP = 24

/** The narrowest and widest a step of the dot grid is drawn on screen. Past either, the grid halves or doubles. */
const DOT_MIN_PX = 14
const DOT_MAX_PX = 40

/**
 * Where the dot grid behind the picture is drawn for a view: its step on screen and its offset, so the dots move and scale with
 * the picture like the paper it is drawn on. Zoomed far out the grid takes every second dot, and zoomed far in it adds one between,
 * so it never turns into a grey wash or a sparse scatter.
 */
export function dotGrid(view: View): { size: number; x: number; y: number } {
  let size = DOT_STEP * (Number.isFinite(view.scale) && view.scale > 0 ? view.scale : 1)
  while (size < DOT_MIN_PX) size *= 2
  while (size > DOT_MAX_PX) size /= 2
  const wrap = (offset: number) => ((offset % size) + size) % size
  return { size, x: wrap(view.x), y: wrap(view.y) }
}

/** The dot grid as the inline style of the element that pans: the CSS draws the dots, this places them. */
export function dotGridStyle(view: View): { backgroundSize: string; backgroundPosition: string } {
  const grid = dotGrid(view)
  return { backgroundSize: `${grid.size}px ${grid.size}px`, backgroundPosition: `${grid.x}px ${grid.y}px` }
}

/** A wheel's distance in pixels, whether the device reports lines, pages, or pixels. */
export function wheelPixels(delta: number, mode: number, pageSize: number): number {
  if (mode === 1) return delta * 16
  if (mode === 2) return delta * pageSize
  return delta
}
