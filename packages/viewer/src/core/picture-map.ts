/**
 * The boxes and lines of a painted picture, read from its text so the viewer can trace a box's lines over the `img`. Kept equal to
 * the Plotwork portal's reader (`apps/app/src/lib/picture-trace.ts`); `spec/picture.md` is the contract both read.
 *
 * The engine marks what it paints: a box is a group with `data-node` (or `data-state-id` for a state's start, end, choice and
 * history marks), and a line is a group with `data-edge`, `data-link`, `data-transition` or `data-flow` and the ids of its two
 * ends in `data-from` and `data-to`. A Gantt link names its ends in its own id (`data-link="a>b"`), a mind map ribbon is a path
 * with `data-link-from` and `data-link-to` holding topic numbers (the topic is `t<number>`), and a Sankey flow names its ends by
 * the words on their boxes. A line's label is a group with `data-edge-label` equal to the line's id. A kind that marks no ends
 * (a sequence's messages, a class or table relation, a git graph) has nothing to trace, and the map has no lines.
 *
 * The text is parsed with `DOMParser` into a document that is never attached to the page, so nothing in it is drawn or run.
 * Only numbers, ids, the words on a box, and path data that passes `PATH_DATA` leave this module. Path data is drawn again by
 * the viewer, so anything in it but commands and numbers is dropped. A mistake is a result (`null`, or a box left out), never an
 * exception.
 */

export interface TraceBox {
  x: number
  y: number
  width: number
  height: number
}

/** One path of a line, where it is drawn. `filled` is a shape painted by its fill (a ribbon), not a stroke. */
export interface TracePath {
  d: string
  dx: number
  dy: number
  filled: boolean
}

export interface TraceNode {
  id: string
  /** The words on the box, for a screen reader. A state's mark with no words is named by its kind (Start, End), anything else by its id. */
  name: string
  box: TraceBox
  /** The corner radius of the box's own shape, so its outline follows it. */
  radius: number
  /** The place in its series of the diagram that draws this box in full, from the engine's `data-part` (`part=`); absent for none. */
  part?: number
}

export interface TraceLine {
  id: string
  from: string
  to: string
  paths: TracePath[]
  label: TraceBox | null
}

export interface TraceMap {
  viewBox: TraceBox
  nodes: TraceNode[]
  lines: TraceLine[]
}

/** One line of a traced box, from that box's side: the line, which way it runs, and the box at its other end. */
export interface TracedLine {
  line: TraceLine
  direction: 'to' | 'from'
  other: TraceNode
}

export interface Trace {
  node: TraceNode
  lines: TracedLine[]
}

/** Path data the viewer will draw again: path commands, numbers, spaces, commas, dots and minus signs, and nothing else. */
export const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.-]+$/

const BOX_MARKS = ['data-node', 'data-state-id'] as const
const LINE_MARKS = ['data-edge', 'data-link', 'data-transition', 'data-flow'] as const
const SHAPES = 'rect, circle, ellipse, polygon, path'

const num = (value: string | null): number => {
  const parsed = value === null ? Number.NaN : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** The offset of an element from the picture's origin: the sum of the translations above it, or null under a scale or a turn. */
function offsetOf(element: Element): { dx: number; dy: number } | null {
  let dx = 0
  let dy = 0
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    const transform = at.getAttribute('transform')
    if (transform === null || transform.trim() === '') continue
    const match = /^\s*translate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+))?\s*\)\s*$/.exec(transform)
    if (match === null) return null
    dx += num(match[1] ?? null)
    dy += num(match[2] ?? null)
  }
  return { dx, dy }
}

const COMMAND = /[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)/g
/** How many numbers each command takes, and which of them are x and y pairs (the rest of an arc are radii and flags). */
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

/** The box a path's points and control points fall in. A curve never leaves its control points, so the box holds the shape. */
function pathBox(d: string): TraceBox | null {
  if (!PATH_DATA.test(d)) return null
  const xs: number[] = []
  const ys: number[] = []
  let pen = { x: 0, y: 0 }
  let start = pen
  let command = ''
  let numbers: number[] = []
  const flush = () => {
    const upper = command.toUpperCase()
    const relative = command !== upper
    const arity = ARITY[upper] ?? 0
    if (upper === 'Z') pen = start
    for (let index = 0; arity > 0 && index + arity <= numbers.length; index += arity) {
      const n = numbers.slice(index, index + arity)
      const base = relative ? pen : { x: 0, y: 0 }
      const pairs: { x: number; y: number }[] = []
      if (upper === 'H') pairs.push({ x: base.x + (n[0] ?? 0), y: pen.y })
      else if (upper === 'V') pairs.push({ x: pen.x, y: base.y + (n[0] ?? 0) })
      else if (upper === 'A') pairs.push({ x: base.x + (n[5] ?? 0), y: base.y + (n[6] ?? 0) })
      else for (let pair = 0; pair + 1 < n.length; pair += 2) pairs.push({ x: base.x + (n[pair] ?? 0), y: base.y + (n[pair + 1] ?? 0) })
      for (const point of pairs) {
        xs.push(point.x)
        ys.push(point.y)
      }
      pen = pairs[pairs.length - 1] ?? pen
      if (upper === 'M' && index === 0) start = pen
    }
  }
  for (const token of d.match(COMMAND) ?? []) {
    if (/[A-Za-z]/.test(token)) {
      flush()
      command = token
      numbers = []
    } else numbers.push(Number(token))
  }
  flush()
  if (xs.length === 0) return null
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** The box of one shape, in its own coordinates. */
function shapeBox(shape: Element): TraceBox | null {
  const name = shape.localName
  if (name === 'rect') return { x: num(shape.getAttribute('x')), y: num(shape.getAttribute('y')), width: num(shape.getAttribute('width')), height: num(shape.getAttribute('height')) }
  if (name === 'circle' || name === 'ellipse') {
    const rx = num(shape.getAttribute(name === 'circle' ? 'r' : 'rx'))
    const ry = num(shape.getAttribute(name === 'circle' ? 'r' : 'ry'))
    return { x: num(shape.getAttribute('cx')) - rx, y: num(shape.getAttribute('cy')) - ry, width: 2 * rx, height: 2 * ry }
  }
  if (name === 'polygon') return pathBox(`M${shape.getAttribute('points') ?? ''}`)
  if (name === 'path') return pathBox(shape.getAttribute('d') ?? '')
  return null
}

/** The first shape painted inside a box's group, where it is on the picture, and its corner radius. */
function boxOf(group: Element): { box: TraceBox; radius: number } | null {
  const shapes = group.localName === 'g' ? [...group.querySelectorAll(SHAPES)] : [group]
  for (const shape of shapes) {
    const offset = offsetOf(shape)
    const box = offset === null ? null : shapeBox(shape)
    if (offset === null || box === null || box.width <= 0 || box.height <= 0) continue
    const radius = shape.localName === 'rect' ? num(shape.getAttribute('rx')) : shape.localName === 'path' || shape.localName === 'polygon' ? 0 : box.width / 2
    return { box: { ...box, x: box.x + offset.dx, y: box.y + offset.dy }, radius }
  }
  return null
}

/** The paths that draw a line, each checked and placed. A path whose data is not plain path data is left out. */
function pathsOf(line: Element): TracePath[] {
  const paths = line.localName === 'path' ? [line] : [...line.querySelectorAll('path')]
  const out: TracePath[] = []
  for (const path of paths) {
    const d = path.getAttribute('d') ?? ''
    const offset = offsetOf(path)
    if (offset === null || d === '' || !PATH_DATA.test(d)) continue
    const fill = path.getAttribute('fill')
    out.push({ d, ...offset, filled: fill !== null && fill !== 'none' })
  }
  return out
}

/** The two ends a line names, before they are matched to boxes. */
function endsOf(line: Element): { from: string; to: string; numbered: boolean } | null {
  const from = line.getAttribute('data-from')
  const to = line.getAttribute('data-to')
  if (from !== null && to !== null) return { from, to, numbered: false }
  const linkFrom = line.getAttribute('data-link-from')
  const linkTo = line.getAttribute('data-link-to')
  if (linkFrom !== null && linkTo !== null) return { from: linkFrom, to: linkTo, numbered: true }
  /* A Gantt link names its ends in its id, the task before and the task after a `>`. */
  const pair = (line.getAttribute('data-link') ?? '').split('>')
  if (pair.length === 2 && pair[0] !== '' && pair[1] !== '') return { from: pair[0] as string, to: pair[1] as string, numbered: false }
  return null
}

/** The name of a state's mark that has no words (start, end, choice, history, fork, join), as a word a person reads. */
const markName = (group: Element): string => {
  const mark = group.getAttribute('data-state-marker') ?? ''
  return /^[a-z]+$/.test(mark) ? `${(mark[0] as string).toUpperCase()}${mark.slice(1)}` : ''
}

const words = (group: Element): string => (group.querySelector('text')?.textContent ?? '').replace(/\s+/g, ' ').trim()

/**
 * The boxes and lines of a painted picture. Null when the text is not an SVG or has no size. A picture whose kind marks no ends
 * gives a map with no lines, which the viewer takes to mean there is nothing to trace.
 */
export function readTraceMap(svg: string): TraceMap | null {
  const root = parsePicture(svg)
  return root === null ? null : traceMapOf(root)
}

/** The root of a picture's text, parsed into a document that is never attached to the page; null when it is not an SVG. */
export function parsePicture(svg: string): Element | null {
  let document: Document
  try {
    document = new DOMParser().parseFromString(svg, 'image/svg+xml')
  } catch {
    return null
  }
  const root = document.documentElement
  return root.localName !== 'svg' || document.getElementsByTagName('parsererror').length > 0 ? null : root
}

/** The trace map of a picture already parsed with `parsePicture`, so a reader that needs more of it parses it once. */
export function traceMapOf(root: Element): TraceMap | null {
  const viewBox = viewBoxOf(root)
  if (viewBox === null) return null

  const nodes: TraceNode[] = []
  const byId = new Map<string, TraceNode>()
  const byName = new Map<string, TraceNode>()
  for (const group of root.querySelectorAll(BOX_MARKS.map((mark) => `[${mark}]`).join(', '))) {
    const id = BOX_MARKS.map((mark) => group.getAttribute(mark)).find((value) => value !== null) ?? ''
    const placed = boxOf(group)
    if (id === '' || placed === null || byId.has(id)) continue
    const name = words(group) || markName(group) || id
    const part = partOf(group)
    const node: TraceNode = { id, name, ...placed, ...(part === null ? {} : { part }) }
    nodes.push(node)
    byId.set(id, node)
    if (!byName.has(name)) byName.set(name, node)
  }

  const resolve = (end: string, numbered: boolean): TraceNode | undefined =>
    numbered ? byId.get(`t${end}`) : (byId.get(end) ?? byName.get(end))

  const labels = new Map<string, TraceBox>()
  for (const group of root.querySelectorAll('[data-edge-label]')) {
    const id = group.getAttribute('data-edge-label') ?? ''
    const placed = boxOf(group)
    if (id !== '' && placed !== null && !labels.has(id)) labels.set(id, placed.box)
  }

  const lines: TraceLine[] = []
  const marked = [...LINE_MARKS.map((mark) => `[${mark}]`), '[data-link-from]'].join(', ')
  root.querySelectorAll(marked).forEach((element, index) => {
    const ends = endsOf(element)
    if (ends === null) return
    const from = resolve(ends.from, ends.numbered)
    const to = resolve(ends.to, ends.numbered)
    const paths = pathsOf(element)
    if (from === undefined || to === undefined || paths.length === 0) return
    const id = LINE_MARKS.map((mark) => element.getAttribute(mark)).find((value) => value !== null) ?? `line-${index}`
    lines.push({ id, from: from.id, to: to.id, paths, label: labels.get(id) ?? null })
  })

  return { viewBox, nodes, lines }
}

/** A box's `data-part`: a whole number from 1, or null for none or anything else. */
function partOf(group: Element): number | null {
  const value = group.getAttribute('data-part') ?? ''
  return /^[1-9]\d{0,2}$/.test(value) ? Number(value) : null
}

function viewBoxOf(root: Element): TraceBox | null {
  const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  if (box.length === 4 && box.every(Number.isFinite) && (box[2] as number) > 0 && (box[3] as number) > 0) {
    return { x: box[0] as number, y: box[1] as number, width: box[2] as number, height: box[3] as number }
  }
  const width = num(root.getAttribute('width'))
  const height = num(root.getAttribute('height'))
  return width > 0 && height > 0 ? { x: 0, y: 0, width, height } : null
}

/** The boxes that have at least one line, in reading order: top to bottom, then left to right. These are the ones a person can trace. */
export function traceableNodes(map: TraceMap): TraceNode[] {
  const ends = new Set(map.lines.flatMap((line) => [line.from, line.to]))
  return map.nodes.filter((node) => ends.has(node.id)).sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
}

/** A box's lines, each from that box's side. Null for a box with no lines or no such box. */
export function traceOf(map: TraceMap, id: string): Trace | null {
  const node = map.nodes.find((candidate) => candidate.id === id)
  if (node === undefined) return null
  const byId = new Map(map.nodes.map((candidate) => [candidate.id, candidate]))
  const lines: TracedLine[] = []
  for (const line of map.lines) {
    if (line.from === id) lines.push({ line, direction: 'to', other: byId.get(line.to) as TraceNode })
    else if (line.to === id) lines.push({ line, direction: 'from', other: byId.get(line.from) as TraceNode })
  }
  return lines.length === 0 ? null : { node, lines }
}

/** The traceable box under a point of the picture: the smallest one that holds it, so a box inside a box is reachable. */
export function nodeAt(map: TraceMap, point: { x: number; y: number }): TraceNode | null {
  let best: TraceNode | null = null
  for (const node of traceableNodes(map)) {
    const { x, y, width, height } = node.box
    if (point.x < x || point.y < y || point.x > x + width || point.y > y + height) continue
    if (best === null || width * height < best.box.width * best.box.height) best = node
  }
  return best
}

/** The box under a point of the picture that opens a part of its series (`part=`): the smallest one that holds it. */
export function drillNodeAt(map: TraceMap, point: { x: number; y: number }): TraceNode | null {
  let best: TraceNode | null = null
  for (const node of map.nodes) {
    if (node.part === undefined) continue
    const { x, y, width, height } = node.box
    if (point.x < x || point.y < y || point.x > x + width || point.y > y + height) continue
    if (best === null || width * height < best.box.width * best.box.height) best = node
  }
  return best
}
