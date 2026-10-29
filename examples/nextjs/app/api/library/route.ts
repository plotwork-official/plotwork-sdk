import { PlotworkApiError } from '@plotwork.official/sdk'
import { PlotworkOAuthError } from '@plotwork.official/sdk/oauth'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import type { LibraryAnswer } from '@/lib/library'
import { asPerson, isSignedOut, readSession, signInConfig } from '@/lib/sign-in'

/**
 * `GET /api/library`: who the signed-in person is (`plotwork.me()`, scope `profile`) and the first page of their diagrams
 * (`plotwork.library.list()`, scope `library:read`). The token is read from the sealed session cookie and refreshed here when it
 * is about to end; the browser gets names and ids, never a token.
 */
export const runtime = 'nodejs'

const PAGE = 50

function answer(body: LibraryAnswer, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

const signedOut = (): NextResponse => answer({ failure: { status: 401, errorCode: 'example.signed_out', message: 'The sign-in ended. Sign in with Plotwork again.' } }, 401)

function failureOf(error: unknown): NextResponse {
  if (isSignedOut(error)) return signedOut()
  if (error instanceof PlotworkApiError) return answer({ failure: { status: error.status, errorCode: error.errorCode, message: error.message } }, 502)
  if (error instanceof PlotworkOAuthError) return answer({ failure: { status: error.status, errorCode: error.error, message: error.message } }, 502)
  throw error
}

export async function GET(request: NextRequest): Promise<Response> {
  const config = signInConfig()
  const tokens = config === null ? null : await readSession(config, request.cookies)
  if (config === null || tokens === null) return signedOut()

  return asPerson(
    config,
    tokens,
    async (plotwork) => {
      // Both calls ask for the token at once; withRefresh sends one refresh for the two.
      const [me, page] = await Promise.all([plotwork.me(), plotwork.library.list({ limit: PAGE })])
      return answer({
        name: me.name,
        organisation: me.organisation?.name ?? null,
        diagrams: page.items.map(({ id, name, folder, updatedAt }) => ({ id, name, folder, updatedAt })),
        more: page.nextCursor !== null,
      })
    },
    failureOf,
  )
}
