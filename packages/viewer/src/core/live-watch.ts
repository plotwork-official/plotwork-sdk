import { LIVE_INTERVAL_DEFAULT_S, LIVE_INTERVAL_MIN_S } from './limits.js'

/**
 * Watching a live picture for a new version. Every `interval` seconds, and once when the page comes back into view, it calls
 * `check`; it never checks while the page is hidden, so a tab in the background costs no request. A check that fails is skipped,
 * and the next one tries again: a picture already shown stays shown.
 */

/** The interval from an `interval` attribute, in seconds: the default when it is not a number, and never below the minimum. */
export function liveIntervalOf(value: string | null | undefined): number {
  const seconds = value === null || value === undefined || value.trim() === '' ? Number.NaN : Number(value)
  if (!Number.isFinite(seconds)) return LIVE_INTERVAL_DEFAULT_S
  return Math.max(LIVE_INTERVAL_MIN_S, Math.round(seconds))
}

/** What the watch reads from the page, so a test can stand in for it. */
export interface WatchHost {
  isVisible(): boolean
  onVisible(listener: () => void): () => void
  setInterval(handler: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

/** The browser's page, as a watch host. */
export function documentHost(document: Document): WatchHost {
  return {
    isVisible: () => document.visibilityState === 'visible',
    onVisible(listener) {
      const handler = (): void => {
        if (document.visibilityState === 'visible') listener()
      }
      document.addEventListener('visibilitychange', handler)
      return () => document.removeEventListener('visibilitychange', handler)
    },
    setInterval: (handler, ms) => globalThis.setInterval(handler, ms),
    clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>),
  }
}

/** Starts watching; the function it returns stops it. Two checks never overlap. */
export function watchLive(host: WatchHost, intervalS: number, check: () => Promise<void>): () => void {
  let running = false
  const tick = (): void => {
    if (running || !host.isVisible()) return
    running = true
    check()
      .catch(() => undefined)
      .finally(() => {
        running = false
      })
  }
  const handle = host.setInterval(tick, intervalS * 1000)
  const stopVisible = host.onVisible(tick)
  return () => {
    host.clearInterval(handle)
    stopVisible()
  }
}
