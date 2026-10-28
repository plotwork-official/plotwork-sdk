/**
 * Building the element's own nodes with `createElement` and `createElementNS`, never from a string of HTML, so nothing a picture or
 * a page supplies can become markup. Attribute values are set with `setAttribute`, and text with `textContent`.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

type Attributes = Readonly<Record<string, string | number | undefined>>

function apply<T extends Element>(element: T, attributes: Attributes, children: readonly (Node | string)[]): T {
  for (const [name, value] of Object.entries(attributes)) if (value !== undefined) element.setAttribute(name, String(value))
  for (const child of children) element.append(child)
  return element
}

/** An HTML element of the element's own. */
export function html<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Attributes = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  return apply(document.createElement(tag), attributes, children)
}

/** An SVG element of the element's own. */
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Attributes = {}, ...children: (Node | string)[]): SVGElementTagNameMap[K] {
  return apply(document.createElementNS(SVG_NS, tag), attributes, children)
}

/** An icon: a 20 by 20 SVG of one or more paths, hidden from assistive technology because its button has a name. */
export function icon(paths: readonly string[]): SVGSVGElement {
  return svg('svg', { viewBox: '0 0 20 20', width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false' }, ...paths.map((d) => svg('path', { d })))
}
