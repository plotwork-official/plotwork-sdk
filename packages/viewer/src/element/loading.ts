import { fingerprintOf, isFingerprint } from '../core/fingerprint.js'
import { parsePicture, traceMapOf } from '../core/picture-map.js'
import type { TraceMap } from '../core/picture-map.js'
import { loadPicture, pictureUrl, PictureLoadError } from '../core/picture-loader.js'

/**
 * Getting a picture's text and reading it, for the element. A mistake is a `PictureLoadError` with its reason, which the element
 * turns into its notice and `plotwork-error`.
 */

/** The text at `src`, resolved against the page; null when there is no `src`. */
export async function fetchPictureText(src: string | null, base: string, signal: AbortSignal, revalidate: boolean): Promise<string | null> {
  if (src === null || src.trim() === '') return null
  const url = pictureUrl(src, base)
  if (url === null) throw new PictureLoadError('address')
  return loadPicture(url, { signal, revalidate })
}

/** A picture read for showing. */
export interface PictureReading {
  fingerprint: string
  map: TraceMap
}

/**
 * Reads a picture's text: its fingerprint, checked against `pinned` when that is a fingerprint, then its boxes and lines. Returns
 * null when the fingerprint equals `unchangedFrom`, so an update that brought nothing new is not shown again.
 */
export async function readPicture(text: string, pinned: string | null, unchangedFrom: string | null): Promise<PictureReading | null> {
  const fingerprint = await fingerprintOf(text)
  if (pinned !== null && isFingerprint(pinned) && pinned !== fingerprint) throw new PictureLoadError('fingerprint')
  if (unchangedFrom !== null && fingerprint === unchangedFrom) return null
  const root = parsePicture(text)
  const map = root === null ? null : traceMapOf(root)
  if (map === null) throw new PictureLoadError('not-a-picture')
  return { fingerprint, map }
}
