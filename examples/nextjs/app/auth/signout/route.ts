import { revokeToken } from '@plotwork.official/sdk/oauth'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { clearSession, readSession, signInConfig } from '@/lib/sign-in'

/**
 * `POST /auth/signout`: revokes the refresh token, which ends the whole grant (the app disappears from the person's Connected apps),
 * and clears the session cookie. A form posts here; it is not a link, so a page elsewhere cannot sign the person out.
 */
export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<Response> {
  const config = signInConfig()
  if (config === null) return NextResponse.redirect(new URL('/', request.url), 303)
  if (request.headers.get('origin') !== config.appUrl) return new NextResponse('Sign out from this app\'s own page.', { status: 403 })

  const tokens = await readSession(config, request.cookies)
  if (tokens !== null) {
    try {
      await revokeToken({ clientId: config.clientId, clientSecret: config.clientSecret, baseUrl: config.baseUrl, token: tokens.refreshToken, tokenTypeHint: 'refresh_token' })
    } catch {
      // The cookie is cleared all the same; the grant ends by itself 30 days after its last use.
    }
  }
  const response = NextResponse.redirect(new URL('/', config.appUrl), 303)
  clearSession(config, response)
  return response
}
