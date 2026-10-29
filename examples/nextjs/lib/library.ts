/** What `GET /api/library` answers, shared by the route and the component that calls it. */
export type LibraryAnswer =
  | {
      name: string | null
      organisation: string | null
      diagrams: { id: string; name: string | null; folder: string | null; updatedAt: number }[]
      /** True when the library has more than the first page shown. */
      more: boolean
    }
  | { failure: { status: number; errorCode: string; message: string } }

/** A library id as the API makes them. Anything else is refused before it costs a call. */
export const DIAGRAM_ID = /^[A-Za-z0-9_-]{1,64}$/
