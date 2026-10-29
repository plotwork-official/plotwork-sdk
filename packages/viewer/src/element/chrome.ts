import { drawnScheme, themeChoiceOf, withScheme } from '../core/picture-scheme.js'
import type { ViewerLabels } from './copy.js'
import type { Shell } from './shell.js'

/**
 * Everything the element shows around the picture: the `img` and the paper behind it, the canvas's name, the toolbar's words, the
 * full screen button, and the wheel hint. Each takes the nodes it changes, so the element only says when.
 */

/** The paper behind the picture: the scheme it was drawn in, else the one asked for (`theme`), else the page's. */
export function paintPaper(element: HTMLElement, text: string | null): void {
  const choice = themeChoiceOf(element.getAttribute('theme'))
  const drawn = text === null ? null : drawnScheme(text)
  const paper = drawn ?? (choice === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : choice)
  element.setAttribute('data-paper', paper)
}

/** The picture's `img`, pointed at a `blob:` address of its text, which it revokes when the picture changes or goes. */
export class PictureImage {
  readonly #picture: HTMLImageElement
  #blob: string | null = null

  constructor(picture: HTMLImageElement) {
    this.#picture = picture
  }

  /** Shows the text in the scheme `theme` asks for. */
  show(text: string, theme: string | null): void {
    const blob = URL.createObjectURL(new Blob([withScheme(text, themeChoiceOf(theme))], { type: 'image/svg+xml' }))
    this.#picture.src = blob
    if (this.#blob !== null) URL.revokeObjectURL(this.#blob)
    this.#blob = blob
  }

  clear(): void {
    this.#picture.removeAttribute('src')
    if (this.#blob !== null) URL.revokeObjectURL(this.#blob)
    this.#blob = null
  }
}

/** Puts the words of `labels` on the toolbar's buttons and the wheel hint. */
export function labelControls(shell: Shell, labels: ViewerLabels): void {
  const { zoomIn, zoomOut, fit, hint } = shell
  for (const [button, label] of [[zoomIn, labels.zoomIn], [zoomOut, labels.zoomOut], [fit, labels.fit]] as const) {
    button.setAttribute('aria-label', label)
    button.title = label
  }
  hint.textContent = labels.wheelHint
}

/** Names the canvas: the page's `label`, then what the canvas is. */
export function describeCanvas(shell: Shell, label: string | null, labels: ViewerLabels): void {
  shell.canvas.setAttribute('aria-label', label === null || label.trim() === '' ? labels.canvas : `${label}. ${labels.canvas}`)
}

/** Names the full screen button for the state the element is in. */
export function syncFullscreen(element: HTMLElement, shell: Shell, labels: ViewerLabels): void {
  const label = document.fullscreenElement === element ? labels.exitFullscreen : labels.fullscreen
  shell.fullscreen.setAttribute('aria-label', label)
  shell.fullscreen.title = label
}

export async function toggleFullscreen(element: HTMLElement): Promise<void> {
  try {
    if (document.fullscreenElement === element) await document.exitFullscreen()
    else await element.requestFullscreen()
  } catch {
    // Full screen refused (an iframe without permission): the button simply does nothing.
  }
}

/** The hint that tells a reader how to zoom with the wheel, shown for a moment each time a plain wheel is left to the page. */
export class WheelHint {
  readonly #hint: HTMLElement
  #timer: ReturnType<typeof setTimeout> | undefined

  constructor(hint: HTMLElement) {
    this.#hint = hint
  }

  show(): void {
    this.#hint.setAttribute('data-shown', '')
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => this.#hint.removeAttribute('data-shown'), 1500)
  }

  stop(): void {
    clearTimeout(this.#timer)
  }
}
