import type { LibraryFailure, LibraryItem } from './pages.js'

/**
 * Every word `<plotwork-library>` shows or says. A page in another language sets the element's `labels` property to a partial copy;
 * anything it leaves out stays English.
 */
export interface LibraryLabels {
  /** The list's name, for a screen reader, when the element has no `label`. */
  list: string
  search: string
  loading: string
  empty: string
  noMatch: (query: string) => string
  results: (count: number) => string
  untitled: string
  updated: (when: Date) => string
  more: string
  retry: string
  classification: Readonly<Record<NonNullable<LibraryItem['classification']>, string>>
  failed: Readonly<Record<LibraryFailure, string>>
}

const DATE = (() => {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
  } catch {
    // An engine with no Intl dates: the ISO day is still a date.
    return null
  }
})()

export const DEFAULT_LIBRARY_LABELS: LibraryLabels = {
  list: 'Your Plotwork diagrams',
  search: 'Search diagrams',
  loading: 'Loading your diagrams',
  empty: 'No diagrams yet. A diagram you publish appears here.',
  noMatch: (query) => `No diagram matches "${query}".`,
  results: (count) => `${count} ${count === 1 ? 'diagram' : 'diagrams'}`,
  untitled: 'Untitled diagram',
  updated: (when) => `Updated ${DATE === null ? when.toISOString().slice(0, 10) : DATE.format(when)}`,
  more: 'Load more',
  retry: 'Try again',
  classification: { public: 'Public', internal: 'Internal', confidential: 'Confidential' },
  failed: {
    address: 'This API address cannot be used.',
    'signed-out': 'Sign in with Plotwork to see your diagrams.',
    forbidden: 'This app may not read your library. Sign in again and allow it.',
    network: 'Your diagrams could not be loaded. Check the connection and try again.',
  },
}

/** The labels with a page's own over the defaults. */
export function mergeLibraryLabels(own: Partial<LibraryLabels> | undefined): LibraryLabels {
  if (own === undefined) return DEFAULT_LIBRARY_LABELS
  return {
    ...DEFAULT_LIBRARY_LABELS,
    ...own,
    classification: { ...DEFAULT_LIBRARY_LABELS.classification, ...own.classification },
    failed: { ...DEFAULT_LIBRARY_LABELS.failed, ...own.failed },
  }
}
