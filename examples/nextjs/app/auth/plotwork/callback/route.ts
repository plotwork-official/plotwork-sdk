import { exchangeCode, parseRedirect, PlotworkOAuthError } from '@plotwork.official/sdk/oauth'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { clearFlow, readFlow, signInConfig, writeSession } from '@/lib/sign-in'

/**
 * `GET /auth/plotwork/callback`: where Plotwork sends the browser back. It checks the state against the sealed sign-in cookie, trades
 * the code and the verifier (with the client secret) for tokens, keeps them in the sealed session cookie, and goes home. A refusal
 * goes home too, with its OAuth code for the page to explain.
 */
export const runtime = 'nodejs'

/** OAuth's codes are lower case words; anything else is not shown. */
const reasonOf = (error: unknown): string => (error instanceof PlotworkOAuthError && /^[a-z_.]{1,40}$/.test(error.error) ? error.error : 'failed')

export async function GET(request: NextRequest): Promise<Response> {
  const config = signInConfig()
  if (config === null) return NextResponse.redirect(new URL('/?signin=not_configured', request.url), 303)

  const home = new URL('/', config.appUrl)
  const flow = await readFlow(config, request.cookies)
  if (flow === null) {
    // No trip in progress here: it took longer than ten minutes, or the link was opened in another browser.
    home.searchParams.set('signin', 'expired')
    const response = NextResponse.redirect(home, 303)
    clearFlow(config, response)
    return response
  }

  try {
    // The state is checked first, so an answer this browser did not ask for is never read.
    const code = parseRedirect(request.url, flow.state, { baseUrl: config.baseUrl })
    const tokens = await exchangeCode({ clientId: config.clientId, clientSecret: config.clientSecret, baseUrl: config.baseUrl, code, redirectUri: config.redirectUri, codeVerifier: flow.verifier })
    const response = NextResponse.redirect(home, 303)
    clearFlow(config, response)
    await writeSession(config, response, tokens)
    return response
  } catch (error) {
    if (!(error instanceof PlotworkOAuthError)) throw error
    home.searchParams.set('signin', reasonOf(error))
    const response = NextResponse.redirect(home, 303)
    clearFlow(config, response)
    return response
  }
}
