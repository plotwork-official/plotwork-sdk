import { vi } from 'vitest'

/**
 * What jsdom does not have and the element uses: `ResizeObserver`, `matchMedia`, `URL.createObjectURL`, and a canvas with a size.
 * Each stand-in is the least that lets the element run; nothing here pretends to draw.
 */
export const CANVAS_SIZE = { width: 1000, height: 500 }

export function installBrowserStubs(): void {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
  globalThis.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof matchMedia
  let blobs = 0
  URL.createObjectURL = vi.fn(() => {
    blobs += 1
    return `blob:test/${blobs}`
  })
  URL.revokeObjectURL = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => CANVAS_SIZE.width })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => CANVAS_SIZE.height })
}

/** Waits for the element's async work (a fingerprint, a fetch) to finish. */
export async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}
