/**
 * Reading the source out of a Plotwork picture, with no engine. A picture saved with its source carries the text it was drawn from in
 * one `<metadata data-format="buun-diagram">` element of its root; this reads it back with patterns, as the engine's own reader does,
 * so it needs no XML parser. Kept equal to the portal's reader (`apps/app/src/lib/picture-source.ts`). A mistake is a result, never
 * an exception.
 */

/** What reading a picture's source found. */
export type SourceReading =
  /** The source, exactly as it was written into the picture. */
  | { status: 'found'; source: string }
  /** A picture that carries no source: it was saved without it, or served by an organisation's embed link, which removes it. */
  | { status: 'none' }
  /** Not a picture, or a source that was changed after it was written and cannot be read back. */
  | { status: 'unreadable' }

const SOURCE_FORMAT = 'buun-diagram'
const OPEN = `<metadata data-format="${SOURCE_FORMAT}"`
const CLOSE = '</metadata>'

/** What can come before the root element of a saved SVG: a byte order mark, white space, an XML declaration, comments, and a doctype. */
const PROLOGUE = /^(?:﻿|\s|<\?xml[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/i

function fromRoot(svg: string): string | null {
  const rest = svg.slice(PROLOGUE.exec(svg)?.[0].length ?? 0)
  return /^<svg[\s>]/.test(rest) ? rest : null
}

const ESCAPE = /&(amp|lt|gt|#13);/g
const UNESCAPED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', '#13': '\r' }

/** Reverses the writer's escaping; null when the text has a `&` that is not one of its four escapes, or a `<`, which the writer never leaves. */
function unescapeSource(text: string): string | null {
  if (text.includes('<') || text.replace(ESCAPE, '').includes('&')) return null
  return text.replace(ESCAPE, (_whole, name: string) => UNESCAPED[name] ?? '')
}

/** The source a picture carries, a picture that carries none, or a text that cannot be read as either. */
export function readEmbeddedSource(svg: string): SourceReading {
  const root = fromRoot(svg)
  if (root === null) return { status: 'unreadable' }
  const start = root.indexOf(OPEN)
  if (start === -1) return { status: 'none' }
  const tagEnd = root.indexOf('>', start)
  if (tagEnd === -1) return { status: 'unreadable' }
  const tag = root.slice(start, tagEnd)
  if (tag.endsWith('/')) return { status: 'unreadable' }
  const close = root.indexOf(CLOSE, tagEnd)
  if (close === -1) return { status: 'unreadable' }
  const text = unescapeSource(root.slice(tagEnd + 1, close))
  if (text === null) return { status: 'unreadable' }
  const encoding = /\sdata-encoding="([^"]*)"/.exec(tag)?.[1] ?? 'text'
  if (encoding === 'text') return text === '' ? { status: 'unreadable' } : { status: 'found', source: text }
  if (encoding !== 'json') return { status: 'unreadable' }
  try {
    const decoded: unknown = JSON.parse(text)
    return typeof decoded === 'string' && decoded !== '' ? { status: 'found', source: decoded } : { status: 'unreadable' }
  } catch {
    // The JSON was cut or edited after it was written: that is the answer (unreadable), not an error to throw.
    return { status: 'unreadable' }
  }
}
