import { createElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import type { CSSProperties, ReactElement, Ref } from 'react'

import type { Fetcher, TokenSource } from '../core/access.js'
import type { LibraryLabels } from '../library/copy.js'
import { definePlotworkLibrary, LIBRARY_TAG_NAME } from '../library/define.js'
import type { LibraryErrorDetail, PlotworkLibraryElement, SelectDetail } from '../library/plotwork-library.js'

/**
 * `<PlotworkLibrary>`: the `<plotwork-library>` element for React. It registers the element on first render, sets `token`, `fetch`
 * and `labels` as properties before the element's first request, and turns its events into callbacks. The ref is the element, with
 * `reload()`, `items` and `selected`.
 */
export interface PlotworkLibraryProps {
  /** A token from Sign in with Plotwork with `library:read`, or a function that gives the current one. */
  token?: TokenSource | null | undefined
  /** The `fetch` the element calls, such as one that goes through the page's own server. */
  fetch?: Fetcher | null | undefined
  /** The API: production by default, `https://api-preview.plotwork.dev` for preview. */
  baseUrl?: string | undefined
  /** Keep to this folder and everything in it, such as `Payments/Checkout`. */
  folder?: string | undefined
  /** The list's name, for a screen reader. */
  label?: string | undefined
  theme?: 'auto' | 'light' | 'dark' | undefined
  labels?: Partial<LibraryLabels> | undefined
  className?: string | undefined
  style?: CSSProperties | undefined
  onSelect?: ((detail: SelectDetail) => void) | undefined
  onError?: ((detail: LibraryErrorDetail) => void) | undefined
}

const EVENTS = { 'plotwork-select': 'onSelect', 'plotwork-error': 'onError' } as const

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function PlotworkLibraryInner(props: PlotworkLibraryProps, ref: Ref<PlotworkLibraryElement | null>): ReactElement {
  const element = useRef<PlotworkLibraryElement | null>(null)
  const latest = useRef(props)
  latest.current = props
  useImperativeHandle(ref, () => element.current as PlotworkLibraryElement, [])

  useClientLayoutEffect(() => {
    definePlotworkLibrary()
  }, [])

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

  // A new token function each render costs no request: the element asks it at its next request.
  useClientLayoutEffect(() => {
    const node = element.current
    if (node === null) return
    node.token = props.token ?? null
    node.fetch = props.fetch ?? null
  }, [props.token, props.fetch])

  useClientLayoutEffect(() => {
    const node = element.current
    if (node !== null) node.labels = props.labels
  }, [props.labels])

  return createElement(LIBRARY_TAG_NAME, {
    ref: element,
    'base-url': props.baseUrl,
    folder: props.folder,
    label: props.label,
    theme: props.theme,
    class: props.className,
    style: props.style,
  })
}

export const PlotworkLibrary = forwardRef(PlotworkLibraryInner)
PlotworkLibrary.displayName = 'PlotworkLibrary'

export type { LibraryErrorDetail, PlotworkLibraryElement, SelectDetail } from '../library/plotwork-library.js'
