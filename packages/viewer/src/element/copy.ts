/**
 * Every word the element shows or says, in one place. A page in another language sets the element's `labels` property to a partial
 * copy of this object; anything it leaves out stays English.
 */
export interface ViewerLabels {
  canvas: string
  zoomIn: string
  zoomOut: string
  fit: string
  fullscreen: string
  exitFullscreen: string
  zoomLevel: (percent: number) => string
  loading: string
  wheelHint: string
  traced: (name: string, lines: number) => string
  drill: (name: string) => string
  updated: string
  failed: Readonly<Record<'address' | 'missing' | 'signed-out' | 'not-a-picture' | 'network' | 'fingerprint' | 'empty', string>>
}

export const DEFAULT_LABELS: ViewerLabels = {
  canvas: 'Diagram. Arrow keys move it, plus and minus zoom, 0 fits it.',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit to view',
  fullscreen: 'Full screen',
  exitFullscreen: 'Leave full screen',
  zoomLevel: (percent) => `${percent}%`,
  loading: 'Loading the diagram',
  wheelHint: 'Hold Control or Command and scroll to zoom',
  traced: (name, lines) => `${name}: ${lines} ${lines === 1 ? 'line' : 'lines'}`,
  drill: (name) => `${name} opens its part`,
  updated: 'The diagram was updated',
  failed: {
    address: 'This diagram address cannot be shown.',
    missing: 'This diagram is not there.',
    'signed-out': 'Sign in to see this diagram.',
    'not-a-picture': 'This is not a Plotwork diagram.',
    network: 'The diagram could not be loaded. Check the connection and the page settings.',
    fingerprint: 'This diagram has changed since the page pinned it, so it is not shown.',
    empty: 'No diagram to show.',
  },
}

/** The labels with a page's own over the defaults. */
export function mergeLabels(own: Partial<ViewerLabels> | undefined): ViewerLabels {
  if (own === undefined) return DEFAULT_LABELS
  return { ...DEFAULT_LABELS, ...own, failed: { ...DEFAULT_LABELS.failed, ...own.failed } }
}
