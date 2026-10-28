import type { View } from '../core/canvas-view.js'
import type { Trace, TraceBox, TraceMap } from '../core/picture-map.js'
import { svg } from './dom.js'

/**
 * The traced box's lines, drawn by the element over the picture, never inside it. The picture stays an `img`, which runs no
 * script; this is an SVG of the element's own, in the picture's viewBox, sized and moved exactly as the `img` is. It holds only
 * numbers and the path data `readTraceMap` checked. A veil dims everything but the traced box, the boxes at the other ends and the
 * lines' labels; the lines are drawn again over the veil, stopping at each label; and the boxes are outlined. The same as the
 * portal's `TraceOverlay`.
 */

/** How far an outline sits outside the box it marks, in the picture's units. */
const OUTSET = 3

const outset = (box: TraceBox, by: number): TraceBox => ({ x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by })

const rect = (box: TraceBox, extra: Record<string, string | number>): SVGRectElement =>
  svg('rect', { x: box.x, y: box.y, width: box.width, height: box.height, ...extra })

let masks = 0

/** The overlay for one trace. `place` sizes and moves it with the picture. */
export function traceLayer(map: TraceMap, trace: Trace): SVGSVGElement {
  masks += 1
  const maskId = `plotwork-trace-${masks}`
  const { viewBox } = map
  const others = trace.lines.map((line) => line.other).filter((node, index, all) => node.id !== trace.node.id && all.findIndex((seen) => seen.id === node.id) === index)
  const labels = trace.lines.map((line) => line.line.label).filter((label): label is TraceBox => label !== null)
  const chosen = outset(trace.node.box, OUTSET)
  const holes = [chosen, ...others.map((node) => outset(node.box, OUTSET)), ...labels.map((label) => outset(label, 2))]
  const whole = { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height }
  const unitsOf = { maskUnits: 'userSpaceOnUse', ...whole }

  const lines = svg('g', { mask: `url(#${maskId}-lines)` })
  for (const { line } of trace.lines) {
    const group = svg('g', { 'data-line': line.id })
    for (const path of line.paths) {
      const placed = svg('g', path.dx === 0 && path.dy === 0 ? {} : { transform: `translate(${path.dx} ${path.dy})` })
      placed.append(svg('path', { class: 'halo', d: path.d }), svg('path', { class: path.filled ? 'ribbon' : 'stroke', d: path.d }))
      group.append(placed)
    }
    lines.append(group)
  }

  return svg(
    'svg',
    { class: 'trace', 'aria-hidden': 'true', focusable: 'false', 'data-trace': trace.node.id, viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}` },
    svg(
      'defs',
      {},
      svg('mask', { id: maskId, ...unitsOf }, rect(whole, { fill: '#fff' }), ...holes.map((hole) => rect(hole, { rx: 6, fill: '#000' }))),
      svg('mask', { id: `${maskId}-lines`, ...unitsOf }, rect(whole, { fill: '#fff' }), ...labels.map((label) => rect(label, { rx: label.height / 2, fill: '#000' }))),
    ),
    rect(whole, { class: 'veil', mask: `url(#${maskId})` }),
    lines,
    ...labels.map((label) => {
      const box = outset(label, 2)
      return rect(box, { class: 'label', rx: box.height / 2 })
    }),
    ...others.map((node) => rect(outset(node.box, OUTSET), { class: 'end', 'data-end': node.id, rx: node.radius + OUTSET })),
    rect(chosen, { class: 'chosen', rx: trace.node.radius + OUTSET }),
  )
}

/** Sizes and moves an element drawn in the picture's units (the `img` or the overlay) to a view. */
export function place(element: HTMLElement | SVGElement, size: { width: number; height: number }, view: View): void {
  element.style.width = `${size.width * view.scale}px`
  element.style.height = `${size.height * view.scale}px`
  element.style.transform = `translate(${view.x}px, ${view.y}px)`
}
