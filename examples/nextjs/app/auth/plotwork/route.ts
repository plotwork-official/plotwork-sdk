import { authorizeUrl, createPkce } from '@plotwork.official/sdk/oauth'
import { NextResponse } from 'next/server'

import { SCOPES, signInConfig, writeFlow } from '@/lib/sign-in'

/**
 * `GET /auth/plotwork`: starts Sign in with Plotwork. It makes a PKCE verifier and a state, keeps both in a sealed cookie that only
 * the callback receives, and sends the browser to Plotwork to approve the app.
 */
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  const config = signInConfig()
  if (config === null) return NextResponse.redirect(new URL('/?signin=not_configured', request.url), 303)

  const pkce = await createPkce()
  const { url, state } = authorizeUrl({ clientId: config.clientId, redirectUri: config.redirectUri, scopes: SCOPES, codeChallenge: pkce.challenge, baseUrl: config.baseUrl })
  const response = NextResponse.redirect(url, 303)
  await writeFlow(config, response, { verifier: pkce.verifier, state })
  return response
}
