import { Plotwork } from '@plotwork.official/sdk'
import type { RefreshingToken } from '@plotwork.official/sdk/oauth'
import { PlotworkDiagram, PlotworkLibrary } from '@plotwork.official/viewer/react'
import { useEffect, useState } from 'react'

import { baseUrl, CALLBACK_PATH, clientId, loadSignIn, signOut, startSignIn } from './sign-in'

type Session = { kind: 'checking' } | { kind: 'signed-out'; problem: string | null } | { kind: 'signed-in'; token: RefreshingToken; name: string | null }

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : 'The sign-in did not finish.')

/**
 * Sign in with Plotwork with no server: the browser trades the code for tokens itself, then `<PlotworkLibrary>` lists the person's
 * diagrams and `<PlotworkDiagram>` shows the one they choose, each sending the token straight to the Plotwork API.
 */
export function SignIn() {
  const [session, setSession] = useState<Session>({ kind: 'checking' })
  const [chosen, setChosen] = useState<{ name: string; pictureUrl: string } | null>(null)

  useEffect(() => {
    let live = true
    const tokens = loadSignIn()
    // The code and state are spent: take them out of the address and the history.
    if (location.pathname === CALLBACK_PATH) history.replaceState(null, '', '/')
    tokens
      .then(async (token) => {
        if (token === null) return { kind: 'signed-out', problem: null } satisfies Session
        const me = await new Plotwork({ accessToken: token, baseUrl }).me()
        return { kind: 'signed-in', token, name: me.name } satisfies Session
      })
      .catch((error: unknown): Session => ({ kind: 'signed-out', problem: messageOf(error) }))
      .then((next) => {
        if (live) setSession(next)
      })
    return () => {
      live = false
    }
  }, [])

  if (clientId === '') {
    return (
      <div className="notice" role="note">
        <p>
          <strong>Register an app to sign in.</strong> On <a href="https://app.plotwork.dev">app.plotwork.dev</a>, open Developers, then
          Developer apps, and register a public app with the redirect address <code>http://localhost:5173/callback</code>. Then:
        </p>
        <pre>
          <code>{'# in .env.local\nVITE_PLOTWORK_CLIENT_ID=<the client id>\n# then restart\nnpm run dev'}</code>
        </pre>
        <p>A public app has no secret: the client id is fine in the bundle.</p>
      </div>
    )
  }

  if (session.kind === 'checking') return <p role="status">Checking for a sign-in</p>

  if (session.kind === 'signed-out') {
    return (
      <>
        {session.problem === null ? null : (
          <p className="notice" role="alert">
            {session.problem}
          </p>
        )}
        <button type="button" className="signin" onClick={() => void startSignIn()}>
          <img src="https://assets.plotwork.dev/brand/logo/plotwork-mark-on-light.svg" alt="" width={20} height={20} />
          Sign in with Plotwork
        </button>
      </>
    )
  }

  return (
    <div className="library">
      <div className="who">
        <p>
          Signed in as <strong>{session.name ?? 'your Plotwork account'}</strong>
        </p>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            setChosen(null)
            setSession({ kind: 'signed-out', problem: null })
            void signOut()
          }}
        >
          Sign out
        </button>
      </div>
      <div className="picker">
        <PlotworkLibrary
          token={session.token}
          baseUrl={baseUrl}
          label="Your diagrams"
          className="library-list"
          onSelect={({ id, name, pictureUrl }) => setChosen({ name: name ?? id, pictureUrl })}
        />
        <div className="result">
          {chosen === null ? (
            <p className="notice">Choose a diagram to show it.</p>
          ) : (
            <PlotworkDiagram src={chosen.pictureUrl} token={session.token} label={chosen.name} className="diagram" />
          )}
        </div>
      </div>
    </div>
  )
}
