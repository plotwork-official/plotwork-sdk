import { PlotworkApiError } from '@plotwork.official/sdk'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { DIAGRAM_ID } from '@/lib/library'
import { asPerson, isSignedOut, readSession, signInConfig } from '@/lib/sign-in'

/**
 * `GET /api/picture/{id}`: one picture of the signed-in person's library, fetched here with their token
 * (`plotwork.library.picture`) and passed on, so the token never reaches the browser. The API's strong ETag is passed through: the
 * browser sends it back as `If-None-Match`, this route sends it on, and an unchanged picture is a 304 with no body.
 */
export const runtime = 'nodejs'

const HEADERS = {
  'Cache-Control': 'private, no-cache',
  'X-Content-Type-Options': 'nosniff',
  // Opened on its own, the picture may draw but never run anything.
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:",
}

function failureOf(error: unknown): NextResponse {
  if (isSignedOut(error)) return new NextResponse(null, { status: 401, headers: HEADERS })
  if (error instanceof PlotworkApiError && (error.status === 403 || error.status === 404)) return new NextResponse(null, { status: error.status, headers: HEADERS })
  if (error instanceof PlotworkApiError) return new NextResponse(null, { status: 502, headers: HEADERS })
  throw error
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params
  if (!DIAGRAM_ID.test(id)) return new NextResponse(null, { status: 404, headers: HEADERS })
  const config = signInConfig()
  const tokens = config === null ? null : await readSession(config, request.cookies)
  if (config === null || tokens === null) return new NextResponse(null, { status: 401, headers: HEADERS })

  const held = request.headers.get('if-none-match') ?? undefined
  return asPerson(
    config,
    tokens,
    async (plotwork) => {
      const picture = await plotwork.library.picture(id, { etag: held })
      if (picture === null) return new NextResponse(null, { status: 304, headers: { ...HEADERS, ...(held === undefined ? {} : { ETag: held }) } })
      return new NextResponse(picture.svg, {
        status: 200,
        headers: { ...HEADERS, 'Content-Type': 'image/svg+xml; charset=utf-8', ...(picture.etag === null ? {} : { ETag: picture.etag }) },
      })
    },
    failureOf,
  )
}
