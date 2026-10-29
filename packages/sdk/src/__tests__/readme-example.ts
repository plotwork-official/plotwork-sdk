// Type-checked by `tsc --noEmit`: the README's example, so it cannot drift from the generated types. Never run.
import { Plotwork, PlotworkApiError } from '../index.js'
import { authorizeUrl, createPkce, exchangeCode, parseRedirect, withRefresh } from '../oauth/index.js'
import type { TokenSet } from '../oauth/index.js'

export async function readmeExample(apiKey: string): Promise<void> {
  const plotwork = new Plotwork({ apiKey })
  const source = 'flow "Checkout"\nnode web service "Web tier"\nnode api service "Orders API"\nweb -> api : "places order"\n'
  const checked = await plotwork.diagrams.validate({ source })
  if (!checked.valid) console.log(checked.errors)
  const published = await plotwork.diagrams.publish({ source })
  if ('url' in published) console.log(published.url)
  try {
    await plotwork.diagrams.render({ source })
  } catch (error) {
    if (error instanceof PlotworkApiError) console.log(error.status, error.errorCode, error.requestId)
  }
}

// ---- Sign in with Plotwork, as the README shows it. `cookies`, `redirect` and the session are stand-ins for Next.js and the app's own.

declare function cookies(): Promise<{ set(name: string, value: string, options: object): void; get(name: string): { value: string } | undefined; delete(name: string): void }>
declare function redirect(url: string): never
declare function saveToSession(tokens: TokenSet): Promise<void>
declare const session: { tokens: TokenSet }

const clientId = process.env.PLOTWORK_CLIENT_ID ?? ''
const clientSecret = process.env.PLOTWORK_CLIENT_SECRET
const redirectUri = 'https://example.com/auth/plotwork/callback'

export async function startRoute(): Promise<void> {
  const pkce = await createPkce()
  const { url, state } = authorizeUrl({ clientId, redirectUri, scopes: ['library:read', 'profile'], codeChallenge: pkce.challenge })
  const jar = await cookies()
  jar.set('plotwork_sign_in', JSON.stringify({ state, verifier: pkce.verifier }), { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 })
  redirect(url)
}

export async function callbackRoute(request: Request): Promise<void> {
  const jar = await cookies()
  const { state, verifier } = JSON.parse(jar.get('plotwork_sign_in')?.value ?? '{}')
  jar.delete('plotwork_sign_in')
  const code = parseRedirect(request.url, state)
  const tokens = await exchangeCode({ clientId, clientSecret, code, redirectUri, codeVerifier: verifier })
  await saveToSession(tokens)
  redirect('/')
}

export async function serverCall(): Promise<void> {
  const plotwork = new Plotwork({
    accessToken: withRefresh(session.tokens, { clientId, clientSecret, onRefresh: (tokens) => saveToSession(tokens) }),
  })
  const { items } = await plotwork.library.list()
  console.log(items.map((item) => item.name))
}

export async function browserSignIn(): Promise<void> {
  const pkce = await createPkce()
  const { url, state } = authorizeUrl({ clientId, redirectUri: `${location.origin}/callback`, scopes: ['library:read'], codeChallenge: pkce.challenge })
  sessionStorage.setItem('plotwork-sign-in', JSON.stringify({ state, verifier: pkce.verifier }))
  location.assign(url)
}

export async function finishSignIn(): Promise<Plotwork> {
  const { state, verifier } = JSON.parse(sessionStorage.getItem('plotwork-sign-in') ?? '{}')
  sessionStorage.removeItem('plotwork-sign-in')
  const code = parseRedirect(location.href, state)
  const tokens = await exchangeCode({ clientId, code, redirectUri: `${location.origin}/callback`, codeVerifier: verifier })
  return new Plotwork({ accessToken: withRefresh(tokens, { clientId, onRefresh: () => undefined }) })
}
