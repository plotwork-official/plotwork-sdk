import type { ViewerLabels } from './copy.js'
import { html, icon } from './dom.js'
import { VIEWER_CSS } from './styles.js'

/**
 * The element's shadow tree: the stage, the canvas the picture moves on, the picture as an `img`, the toolbar, the notice for a
 * picture that cannot be shown, the wheel hint, and a polite live region. Built once when the element is made; the element changes
 * attributes and text on these nodes and never rebuilds them.
 */

export interface Shell {
  stage: HTMLDivElement
  canvas: HTMLDivElement
  picture: HTMLImageElement
  toolbar: HTMLDivElement
  zoomOut: HTMLButtonElement
  zoomIn: HTMLButtonElement
  zoomLevel: HTMLOutputElement
  fit: HTMLButtonElement
  fullscreen: HTMLButtonElement
  notice: HTMLParagraphElement
  hint: HTMLParagraphElement
  live: HTMLDivElement
}

const ICONS = {
  zoomOut: ['M5 10h10'],
  zoomIn: ['M5 10h10', 'M10 5v10'],
  fit: ['M4 8V4h4', 'M12 4h4v4', 'M16 12v4h-4', 'M8 16H4v-4'],
  fullscreen: ['M3 7V3h4', 'M13 3h4v4', 'M17 13v4h-4', 'M7 17H3v-4', 'M7 7h6v6H7z'],
} as const

function button(label: string, paths: readonly string[]): HTMLButtonElement {
  return html('button', { type: 'button', part: 'button', 'aria-label': label, title: label }, icon(paths))
}

/** Builds the shadow tree into a shadow root. */
export function buildShell(root: ShadowRoot, labels: ViewerLabels): Shell {
  const style = html('style')
  style.textContent = VIEWER_CSS
  const picture = html('img', { class: 'picture', alt: '', draggable: 'false', decoding: 'async' })
  const canvas = html('div', { class: 'canvas', part: 'canvas', tabindex: 0, role: 'img', 'aria-roledescription': 'diagram', 'aria-busy': 'true' }, picture)
  const zoomOut = button(labels.zoomOut, ICONS.zoomOut)
  const zoomIn = button(labels.zoomIn, ICONS.zoomIn)
  const zoomLevel = html('output', { 'aria-hidden': 'true' })
  const fit = button(labels.fit, ICONS.fit)
  const fullscreen = button(labels.fullscreen, ICONS.fullscreen)
  const toolbar = html('div', { class: 'toolbar', part: 'toolbar', role: 'toolbar', hidden: '' }, zoomOut, zoomLevel, zoomIn, fit, fullscreen)
  const notice = html('p', { class: 'notice', part: 'notice', role: 'status' }, labels.loading)
  const hint = html('p', { class: 'hint', 'aria-hidden': 'true' }, labels.wheelHint)
  const live = html('div', { class: 'live', 'aria-live': 'polite' })
  const stage = html('div', { class: 'stage', part: 'stage' }, canvas, toolbar, notice, hint, live)
  root.append(style, stage)
  return { stage, canvas, picture, toolbar, zoomOut, zoomIn, zoomLevel, fit, fullscreen, notice, hint, live }
}
