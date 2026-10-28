/**
 * Which colour scheme a picture is shown in. A Plotwork picture drawn with `scheme=auto` carries both palettes and follows the
 * reader's settings; a host forces one with `data-scheme="light"` or `"dark"` on its root, which the engine's style sheet reads.
 * A picture drawn for one scheme says so in `data-theme` and ignores the attribute.
 */

/** What the viewer is asked to show: follow the page (`auto`), or one scheme. */
export type ThemeChoice = 'auto' | 'light' | 'dark'

/** A scheme a picture is actually drawn in. */
export type Scheme = 'light' | 'dark'

/** Reads a `theme` attribute: anything that is not `light` or `dark` is `auto`. */
export function themeChoiceOf(value: string | null | undefined): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'auto'
}

/** The root `<svg ...>` start tag, after anything that may come before it. */
const ROOT_TAG = /<svg(?=[\s>])[^>]*>/

/**
 * The picture's text with `data-scheme` set on its root for a forced scheme, or as it was for `auto`. It edits the start tag as
 * text, so the picture is never parsed and written out again, and an existing `data-scheme` is replaced, never doubled.
 */
export function withScheme(svg: string, choice: ThemeChoice): string {
  if (choice === 'auto') return svg
  const match = ROOT_TAG.exec(svg)
  if (match === null) return svg
  const tag = match[0].replace(/\sdata-scheme="[^"]*"/, '')
  const marked = tag.replace(/^<svg/, `<svg data-scheme="${choice}"`)
  return svg.slice(0, match.index) + marked + svg.slice(match.index + match[0].length)
}

/** The scheme a picture was drawn in when it was drawn for one (`data-theme="light"` or `"dark"`), else null: it follows the scheme it is shown in. */
export function drawnScheme(svg: string): Scheme | null {
  const tag = ROOT_TAG.exec(svg)?.[0] ?? ''
  const theme = /\sdata-theme="([^"]*)"/.exec(tag)?.[1]
  return theme === 'light' || theme === 'dark' ? theme : null
}
