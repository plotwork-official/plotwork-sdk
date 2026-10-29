/** What `POST /api/draw` answers, shared by the route and the page that calls it. */
export type DrawAnswer =
  | { svg: string }
  | { errors: { line: number; column: number; message: string; hint: string | null }[] }
  | { failure: { status: number; errorCode: string; message: string } }
