import { bearerHeaders, mayCarryToken } from '../core/access.js'
import type { Access, Fetcher } from '../core/access.js'
import { REQUEST_TIMEOUT_MS } from '../core/limits.js'

/**
 * Reading a signed-in person's library from the API: `GET {baseUrl}/v1/library`, a page at a time, with their token and no cookie.
 * Only the fields the list shows leave the answer; a mistake is a `LibraryLoadError` with a reason the element shows.
 */

/** The production API. */
export const DEFAULT_API_URL = 'https://api.plotwork.dev'

/** How many diagrams one page asks for: the most the API gives. */
export const LIBRARY_PAGE_SIZE = 100

/** One diagram of the library, as the list shows it. */
export interface LibraryItem {
  id: string
  name: string | null
  folder: string | null
  /** When it was last published, in milliseconds since the epoch. */
  updatedAt: number
  /** Its label in an organisation's library, or null. */
  classification: 'public' | 'internal' | 'confidential' | null
}

export interface LibraryPage {
  items: LibraryItem[]
  nextCursor: string | null
}

/** Why the library could not be read. */
export type LibraryFailure =
  /** The API address is not https (or http on this computer), so no token goes to it. */
  | 'address'
  /** No token, or the API refused it (401). */
  | 'signed-out'
  /** The token's grant does not hold `library:read` (403). */
  | 'forbidden'
  /** No answer, an error, or an answer that is not a page of the library. */
  | 'network'

export class LibraryLoadError extends Error {
  readonly reason: LibraryFailure

  constructor(reason: LibraryFailure) {
    super(`The library could not be read (${reason})`)
    this.name = 'LibraryLoadError'
    this.reason = reason
  }
}

/** An address on the API, keeping the path of a base address (a proxy at `/plotwork`). */
export function apiAddress(baseUrl: string, path: string): URL {
  return new URL(path.replace(/^\/+/, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
}

/** Where a diagram's picture is, for `<plotwork-diagram src>` with the same token. */
export function pictureUrlOf(baseUrl: string, id: string): string {
  return apiAddress(baseUrl, `/v1/library/${encodeURIComponent(id)}.svg`).href
}

const CLASSIFICATIONS = new Set(['public', 'internal', 'confidential'])

function itemOf(value: unknown): LibraryItem | null {
  if (value === null || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return null
  const text = (field: unknown): string | null => (typeof field === 'string' && field !== '' ? field : null)
  return {
    id: record.id,
    name: text(record.name),
    folder: text(record.folder),
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : 0,
    classification: typeof record.classification === 'string' && CLASSIFICATIONS.has(record.classification) ? (record.classification as LibraryItem['classification']) : null,
  }
}

/** What one page is asked with. */
export interface PageQuery extends Access {
  baseUrl: string
  cursor?: string | null | undefined
  folder?: string | null | undefined
  signal?: AbortSignal | undefined
}

/** One page of the library. */
export async function fetchLibraryPage(query: PageQuery): Promise<LibraryPage> {
  let url: URL
  try {
    url = apiAddress(query.baseUrl, '/v1/library')
  } catch {
    throw new LibraryLoadError('address')
  }
  url.searchParams.set('limit', String(LIBRARY_PAGE_SIZE))
  if (query.folder !== null && query.folder !== undefined && query.folder !== '') url.searchParams.set('folder', query.folder)
  if (query.cursor !== null && query.cursor !== undefined) url.searchParams.set('cursor', query.cursor)
  let bearer: Record<string, string>
  try {
    bearer = await bearerHeaders(query.token)
  } catch {
    throw new LibraryLoadError('signed-out')
  }
  if (bearer.Authorization !== undefined && !mayCarryToken(url)) throw new LibraryLoadError('address')
  const fetcher: Fetcher = query.fetch ?? ((input, init) => fetch(input, init))
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
  const abort = (): void => timeout.abort()
  query.signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetcher(url.href, { credentials: 'omit', headers: { ...bearer, Accept: 'application/json' }, signal: timeout.signal })
    if (response.status === 401) throw new LibraryLoadError('signed-out')
    if (response.status === 403) throw new LibraryLoadError('forbidden')
    if (!response.ok) throw new LibraryLoadError('network')
    const body: unknown = await response.json()
    const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : null
    if (record === null || !Array.isArray(record.items)) throw new LibraryLoadError('network')
    const items = record.items.map(itemOf).filter((item): item is LibraryItem => item !== null)
    return { items, nextCursor: typeof record.nextCursor === 'string' && record.nextCursor !== '' ? record.nextCursor : null }
  } catch (error) {
    if (error instanceof LibraryLoadError || query.signal?.aborted === true) throw error
    throw new LibraryLoadError('network')
  } finally {
    clearTimeout(timer)
    query.signal?.removeEventListener('abort', abort)
  }
}
