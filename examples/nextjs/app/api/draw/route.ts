import { Plotwork, PlotworkApiError } from '@plotwork.official/sdk'

import type { DrawAnswer } from '@/lib/draw'

/**
 * `POST /api/draw` with `{ source }`: checks the diagram with the Plotwork API, then draws it. The API key is read here, on the
 * server, and never reaches the browser. A mistake in the diagram is an answer (`errors`), not an exception.
 */
export const runtime = 'nodejs'

/** Longer source is refused before it costs a call. */
const MAX_SOURCE = 20_000

function answer(body: DrawAnswer, status = 200): Response {
  return Response.json(body, { status })
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.PLOTWORK_API_KEY
  if (!apiKey) {
    return answer({ failure: { status: 500, errorCode: 'example.no_key', message: 'Add PLOTWORK_API_KEY to .env.local and restart the server.' } }, 500)
  }
  const body: unknown = await request.json().catch(() => null)
  const source = body !== null && typeof body === 'object' && 'source' in body ? body.source : undefined
  if (typeof source !== 'string' || source.length === 0 || source.length > MAX_SOURCE) {
    return answer({ failure: { status: 400, errorCode: 'example.bad_source', message: `Send { source } with up to ${MAX_SOURCE} characters.` } }, 400)
  }

  const plotwork = new Plotwork({ apiKey, baseUrl: process.env.PLOTWORK_BASE_URL || undefined })
  try {
    const checked = await plotwork.diagrams.validate({ source })
    if (!checked.valid) {
      return answer({ errors: checked.errors.map(({ line, column, message, hint }) => ({ line, column, message, hint })) })
    }
    const drawn = await plotwork.diagrams.render({ source, scheme: 'auto' })
    return answer({ svg: drawn.svg })
  } catch (error) {
    if (error instanceof PlotworkApiError) {
      return answer({ failure: { status: error.status, errorCode: error.errorCode, message: error.message } }, 502)
    }
    throw error
  }
}
