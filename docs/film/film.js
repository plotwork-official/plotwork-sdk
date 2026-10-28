/**
 * The viewer film: a person adds `@plotwork.official/viewer` to an app, and the real component, built from this repository, does the
 * rest. Everything on screen is a function of one time, `seek(ms)`, so `scripts/film.mjs` draws it frame by frame and every run is
 * the same; opened in a browser on its own, it plays in real time. The viewer is driven with the pointer events a person's mouse
 * sends, so the traces and the drill event are the component's own.
 */
import { definePlotworkDiagram } from '../../packages/viewer/dist/index.js'
import { readTraceMap } from '../../packages/viewer/dist/core/index.js'

const LENGTH = 20_000

/* What is typed, as runs of text and the colour each run is shown in. */
const INSTALL = [['$ ', 't-prompt'], ['npm install @plotwork.official/viewer', '']]
const INSTALLED = [['\n\nadded 1 package in 1s\n', 't-ok']]
const APP = [
  ['import', 't-keyword'], [' { PlotworkDiagram } ', ''], ['from', 't-keyword'], [" '@plotwork.official/viewer/react'", 't-string'],
  ['\n\n', ''], ['export const', 't-keyword'], [' Architecture = () => (\n  ', ''],
  ['<PlotworkDiagram', 't-tag'], ['\n    src=', ''], ['"/diagrams/checkout.svg"', 't-string'], ['\n    live\n    onDrill=', ''],
  ['{openPart}', 't-keyword'], ['\n  ', ''], ['/>', 't-tag'], ['\n)', ''],
]
const PUBLISH = [['\n\n$ ', 't-prompt'], ['plotwork publish checkout.diagram', '']]
const PUBLISHED = [['\n\npublished checkout, version 2\n', 't-ok']]

/** When each thing happens, in milliseconds. */
const AT = {
  installFrom: 300, installEach: 40, installed: 2100,
  appTab: 2700, appFrom: 2900, appEach: 22,
  mount: 6300,
  pointerIn: 6900, toOrders: [7100, 8000], toWeb: [9700, 10500], press: 10700,
  drillOut: 12800, terminalTab: 12900, publishFrom: 13100, publishEach: 38, published: 14600,
  swap: 15000, toastOut: 17200,
  end: 17600,
}

const $ = (id) => document.getElementById(id)
const viewer = /** @type {any} */ ($('viewer'))
const pointer = $('pointer')
const stage = document.querySelector('.stage')

let pictures = { v1: '', v2: '' }
let maps = { v1: null, v2: null }
let done = new Set()
let drilled = null
let changed = null
let lastHover = null

/** The typed runs cut to `count` characters, with a caret after them while typing. */
function typed(target, runs, count, caret) {
  const nodes = []
  let left = count
  for (const [text, tone] of runs) {
    if (left <= 0) break
    const span = document.createElement('span')
    if (tone !== '') span.className = tone
    span.textContent = text.slice(0, left)
    left -= text.length
    nodes.push(span)
  }
  if (caret) {
    const mark = document.createElement('span')
    mark.className = 'caret'
    nodes.push(mark)
  }
  target.replaceChildren(...nodes)
}

const length = (runs) => runs.reduce((sum, [text]) => sum + text.length, 0)
const charsAt = (t, from, each, runs) => Math.max(0, Math.min(length(runs), Math.floor((t - from) / each)))
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

/** The middle of a box of the picture, in page pixels, from the `img` the viewer draws. */
function boxCentre(map, id) {
  const img = viewer.shadowRoot?.querySelector('img.picture')
  const node = map?.nodes.find((each) => each.id === id)
  if (img === null || img === undefined || node === undefined) return null
  const rect = img.getBoundingClientRect()
  const scale = rect.width / map.viewBox.width
  return { x: rect.left + (node.box.x + node.box.width * 0.62 - map.viewBox.x) * scale, y: rect.top + (node.box.y + node.box.height * 0.55 - map.viewBox.y) * scale }
}

/** Where the pointer is at a time: gliding from its entrance to Orders API, then to the Web tier box. */
function pointerAt(t) {
  const browser = document.querySelector('.browser').getBoundingClientRect()
  const start = { x: browser.left + browser.width * 0.78, y: browser.bottom - 40 }
  const orders = boxCentre(maps.v1, 'api') ?? start
  const web = boxCentre(maps.v1, 'web') ?? orders
  const glide = (from, to, [a, b]) => {
    const k = ease(Math.min(1, Math.max(0, (t - a) / (b - a))))
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }
  }
  return t < AT.toWeb[0] ? glide(start, orders, AT.toOrders) : glide(orders, web, AT.toWeb)
}

/** Sends the viewer's canvas the pointer event a mouse would. */
function pointerEvent(type, point) {
  const canvas = viewer.shadowRoot?.querySelector('.canvas')
  if (canvas === null || canvas === undefined) return
  canvas.dispatchEvent(new PointerEvent(type, { clientX: point.x, clientY: point.y, pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, composed: true }))
}

/** Waits for one of the viewer's events. */
const once = (type) => new Promise((resolve) => viewer.addEventListener(type, resolve, { once: true }))

/** The moments that change the component, run once each and in order. */
const ACTIONS = [
  [AT.mount, async () => {
    const loaded = once('plotwork-load')
    viewer.hidden = false
    viewer.svg = pictures.v1
    await loaded
  }],
  [AT.press, async (t) => {
    const at = pointerAt(t)
    pointerEvent('pointerdown', at)
    pointerEvent('pointerup', at)
  }],
  [AT.swap, async () => {
    const shown = once('plotwork-change')
    viewer.svg = pictures.v2
    await shown
  }],
]

/** Draws the film at a time. Resolves once the component has caught up. */
async function seek(t) {
  for (const [at, run] of ACTIONS) {
    if (at <= t && !done.has(at)) {
      done.add(at)
      await run(t)
    }
  }

  const onApp = t >= AT.appTab && t < AT.terminalTab
  document.querySelector('[data-tab="terminal"]').toggleAttribute('data-active', !onApp)
  document.querySelector('[data-tab="app"]').toggleAttribute('data-active', onApp)
  document.querySelector('[data-pane="terminal"]').hidden = onApp
  document.querySelector('[data-pane="app"]').hidden = !onApp

  const install = charsAt(t, AT.installFrom, AT.installEach, INSTALL)
  const publish = charsAt(t, AT.publishFrom, AT.publishEach, PUBLISH)
  const terminalRuns = [...INSTALL.map(([text, tone]) => [text, tone])]
  let count = install
  if (t >= AT.installed) {
    terminalRuns.push(...INSTALLED)
    count = length(INSTALL) + length(INSTALLED)
  }
  if (t >= AT.publishFrom) {
    terminalRuns.push(...PUBLISH)
    count = length(INSTALL) + length(INSTALLED) + publish
  }
  if (t >= AT.published) {
    terminalRuns.push(...PUBLISHED)
    count += length(PUBLISHED)
  }
  const typingTerminal = (t < AT.installed && install < length(INSTALL)) || (t >= AT.publishFrom && t < AT.published)
  typed($('terminal'), terminalRuns, count, typingTerminal || (t >= AT.published && t < AT.end))
  typed($('app'), APP, charsAt(t, AT.appFrom, AT.appEach, APP), onApp)

  const pointing = t >= AT.pointerIn && t < AT.drillOut
  pointer.toggleAttribute('hidden', !pointing)
  if (pointing) {
    const at = pointerAt(t)
    const box = stage.getBoundingClientRect()
    pointer.style.transform = `translate(${at.x - box.left - 4}px, ${at.y - box.top - 2}px) scale(${t >= AT.press && t < AT.press + 160 ? 0.86 : 1})`
    const key = `${Math.round(at.x)},${Math.round(at.y)}`
    if (key !== lastHover) {
      lastHover = key
      pointerEvent('pointermove', at)
    }
  } else if (lastHover !== null) {
    lastHover = null
    viewer.shadowRoot?.querySelector('.canvas')?.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1, pointerType: 'mouse' }))
  }

  $('drill').hidden = drilled === null || t >= AT.drillOut
  $('drill-event').textContent = drilled === null ? '' : `plotwork-drill\n${JSON.stringify(drilled, null, 1).replace(/\n\s*/g, ' ')}`
  $('toast').hidden = changed === null || t >= AT.toastOut
  $('toast').textContent = changed === null ? '' : `plotwork-change: version 2 shown, ${changed.slice(0, 15)}`
  $('end').hidden = t < AT.end
}

viewer.addEventListener('plotwork-drill', (event) => {
  drilled = event.detail
})
viewer.addEventListener('plotwork-change', (event) => {
  changed = event.detail.fingerprint
})

async function start() {
  definePlotworkDiagram()
  const [v1, v2] = await Promise.all(['./checkout.svg', './checkout-v2.svg'].map((path) => fetch(path).then((answer) => answer.text())))
  pictures = { v1, v2 }
  maps = { v1: readTraceMap(v1), v2: readTraceMap(v2) }
  /* A live viewer would see version 2 at its next check of its address; the film hands the text over at once, which the element
     treats the same way: a new version, the view kept, `plotwork-change` sent. */
  window.film = { seek, length: LENGTH, reset: () => { done = new Set(); drilled = null; changed = null } }
  if (!new URLSearchParams(location.search).has('frames')) {
    const begin = performance.now()
    const tick = async () => {
      await seek((performance.now() - begin) % LENGTH)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  document.documentElement.dataset.ready = 'true'
}

start()
