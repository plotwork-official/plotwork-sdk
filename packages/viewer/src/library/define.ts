import { createPlotworkLibraryClass } from './plotwork-library.js'

/** The element's tag. */
export const LIBRARY_TAG_NAME = 'plotwork-library'

/**
 * Registers `<plotwork-library>` once. Safe to call many times, from several copies of the package on one page, and where there is
 * no `customElements` (a server render), where it does nothing.
 */
export function definePlotworkLibrary(tag: string = LIBRARY_TAG_NAME): void {
  if (typeof customElements === 'undefined' || customElements.get(tag) !== undefined) return
  customElements.define(tag, createPlotworkLibraryClass())
}
