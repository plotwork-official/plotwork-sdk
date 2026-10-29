/**
 * `@plotwork.official/viewer/library`: `<plotwork-library>`, a picker of a signed-in person's diagrams. Register it with
 * `definePlotworkLibrary()` or `import '@plotwork.official/viewer/library/register'`.
 */
export { definePlotworkLibrary, LIBRARY_TAG_NAME } from './define.js'
export type { LibraryErrorDetail, PlotworkLibraryElement, PlotworkLibraryEventMap, SelectDetail } from './plotwork-library.js'
export { DEFAULT_LIBRARY_LABELS } from './copy.js'
export type { LibraryLabels } from './copy.js'
export { DEFAULT_API_URL, fetchLibraryPage, LibraryLoadError, pictureUrlOf } from './pages.js'
export type { LibraryFailure, LibraryItem, LibraryPage, PageQuery } from './pages.js'
export type { Access, Fetcher, TokenSource } from '../core/access.js'
