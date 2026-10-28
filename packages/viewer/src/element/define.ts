import { createPlotworkDiagramClass } from './plotwork-diagram.js'

/** The element's tag. */
export const TAG_NAME = 'plotwork-diagram'

/**
 * Registers `<plotwork-diagram>` once. Safe to call many times, from several copies of the package on one page, and where there is
 * no `customElements` (a server render), where it does nothing.
 */
export function definePlotworkDiagram(tag: string = TAG_NAME): void {
  if (typeof customElements === 'undefined' || customElements.get(tag) !== undefined) return
  customElements.define(tag, createPlotworkDiagramClass())
}
