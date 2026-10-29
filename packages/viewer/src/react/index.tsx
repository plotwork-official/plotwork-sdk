import { createElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import type { CSSProperties, ReactElement, Ref } from 'react'

import { definePlotworkDiagram, TAG_NAME } from '../element/define.js'
import type { ViewerLabels } from '../element/copy.js'
import type { ChangeDetail, DrillDetail, ErrorDetail, LoadDetail, TraceDetail } from '../element/events.js'
import type { PlotworkDiagramElement } from '../element/plotwork-diagram.js'
import type { Fetcher, TokenSource } from '../core/access.js'
import type { ThemeChoice } from '../core/picture-scheme.js'

/**
 * `<PlotworkDiagram>`: the `<plotwork-diagram>` element for React. It registers the element on first render, passes plain values as
 * attributes, sets `svg`, `labels`, `token` and `fetch` as properties, and turns the element's events into callbacks. React is a peer dependency;
 * nothing else is imported. The ref is the element itself, with `fit()`, `zoomIn()`, `zoomOut()`, `reload()` and `source()`.
 */
export interface PlotworkDiagramProps {
  /** The picture's address: a file beside the page, a hosted picture, a stable link, or an organisation embed link. */
  src?: string | undefined
  /** The picture's text, for a picture the page already holds (a `.diagram` import). It wins over `src`. */
  svg?: string | null | undefined
  theme?: ThemeChoice | undefined
  /** Check for a new version and show it without a reload. */
  live?: boolean | undefined
  /** Seconds between checks for a live picture: 60 when left out, never below 15. */
  interval?: number | undefined
  /** Show the picture only when its fingerprint is this one (`sha256-<hex>`). A pinned picture is never live. */
  fingerprint?: string | undefined
  /** `zoom` when the viewer is the page and a plain wheel zooms; `modifier` (the default) leaves the wheel to the page. */
  wheel?: 'zoom' | 'modifier' | undefined
  /** `none` hides the toolbar. */
  controls?: 'none' | undefined
  /** What the diagram shows, for a screen reader. */
  label?: string | undefined
  labels?: Partial<ViewerLabels> | undefined
  /**
   * A token from Sign in with Plotwork, or a function that gives the current one, for a picture of the person's library
   * (`/v1/library/{id}.svg`). Embed links and stable links need none.
   */
  token?: TokenSource | null | undefined
  /** The `fetch` the element calls for `src` and live checks. */
  fetch?: Fetcher | null | undefined
  className?: string | undefined
  style?: CSSProperties | undefined
  onLoad?: ((detail: LoadDetail) => void) | undefined
  onChange?: ((detail: ChangeDetail) => void) | undefined
  onError?: ((detail: ErrorDetail) => void) | undefined
  onDrill?: ((detail: DrillDetail) => void) | undefined
  onTrace?: ((detail: TraceDetail) => void) | undefined
}

const EVENTS = { 'plotwork-load': 'onLoad', 'plotwork-change': 'onChange', 'plotwork-error': 'onError', 'plotwork-drill': 'onDrill', 'plotwork-trace': 'onTrace' } as const

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function PlotworkDiagramInner(props: PlotworkDiagramProps, ref: Ref<PlotworkDiagramElement | null>): ReactElement {
  const element = useRef<PlotworkDiagramElement | null>(null)
  const latest = useRef(props)
  latest.current = props
  useImperativeHandle(ref, () => element.current as PlotworkDiagramElement, [])

  useClientLayoutEffect(() => {
    definePlotworkDiagram()
  }, [])

  // Listens before the picture is handed over below: a picture the page already holds loads within a few microtasks, which
  // can be before a passive effect runs, and its `plotwork-load` would be missed.
  useClientLayoutEffect(() => {
    const node = element.current
    if (node === null) return undefined
    const listeners = Object.entries(EVENTS).map(([type, prop]) => {
      const listener = (event: Event): void => {
        const handler = latest.current[prop] as ((detail: unknown) => void) | undefined
        handler?.((event as CustomEvent).detail)
      }
      node.addEventListener(type, listener)
      return () => node.removeEventListener(type, listener)
    })
    return () => {
      for (const remove of listeners) remove()
    }
  }, [])

  // Before the picture: a token set here is read by the element's first request. A new function each render costs no request.
  useClientLayoutEffect(() => {
    const node = element.current
    if (node === null) return
    node.token = props.token ?? null
    node.fetch = props.fetch ?? null
  }, [props.token, props.fetch])

  useClientLayoutEffect(() => {
    const node = element.current
    if (node === null) return
    node.labels = props.labels
    node.svg = props.svg ?? null
  }, [props.svg, props.labels])

  return createElement(TAG_NAME, {
    ref: element,
    src: props.src,
    theme: props.theme,
    live: props.live === true ? '' : undefined,
    interval: props.interval,
    fingerprint: props.fingerprint,
    wheel: props.wheel,
    controls: props.controls,
    label: props.label,
    class: props.className,
    style: props.style,
  })
}

export const PlotworkDiagram = forwardRef(PlotworkDiagramInner)
PlotworkDiagram.displayName = 'PlotworkDiagram'

export type { PlotworkDiagramElement } from '../element/plotwork-diagram.js'
export { PlotworkLibrary } from './library.js'
export type { LibraryErrorDetail, PlotworkLibraryElement, PlotworkLibraryProps, SelectDetail } from './library.js'
