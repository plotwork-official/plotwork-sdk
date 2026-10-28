import type { LoadFailure } from '../core/picture-loader.js'

/**
 * The events `<plotwork-diagram>` sends. Each is a `CustomEvent` that bubbles and crosses the shadow boundary (`composed`), so a
 * page listens on the element or on anything that holds it.
 */

/** A picture is shown for the first time, or again after `src`, `svg` or `theme` changed. */
export interface LoadDetail {
  fingerprint: string
  /** True when the picture carries its source, which `source()` returns. */
  hasSource: boolean
}

/** A live picture changed on the server, and the new version is shown. */
export interface ChangeDetail {
  fingerprint: string
  previous: string
}

/** The picture cannot be shown, and the notice says why. `empty` is an element with neither `src` nor `svg`. */
export interface ErrorDetail {
  reason: LoadFailure | 'empty'
}

/** A box that names a part of its series (`part=`) was pressed. The page decides what opens. */
export interface DrillDetail {
  id: string
  part: number
  name: string
}

/** A box is traced (its id), or nothing is (null). */
export interface TraceDetail {
  id: string | null
}

export interface PlotworkEventMap {
  'plotwork-load': CustomEvent<LoadDetail>
  'plotwork-change': CustomEvent<ChangeDetail>
  'plotwork-error': CustomEvent<ErrorDetail>
  'plotwork-drill': CustomEvent<DrillDetail>
  'plotwork-trace': CustomEvent<TraceDetail>
}

/** Sends one of the element's events from it. */
export function emit<K extends keyof PlotworkEventMap>(target: EventTarget, type: K, detail: PlotworkEventMap[K]['detail']): void {
  target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }))
}
