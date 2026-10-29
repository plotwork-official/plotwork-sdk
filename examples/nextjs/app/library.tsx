'use client'

import { PlotworkDiagram } from '@plotwork.official/viewer/react'
import { useEffect, useState } from 'react'

import type { LibraryAnswer } from '@/lib/library'

/**
 * The viewer sends no cookie by default. These pictures come from this app's own `/api/picture/{id}`, which needs the session
 * cookie to find the person's token, so the viewer is given a `fetch` that sends cookies to this origin only.
 */
function sameOrigin(input: string, init: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: 'same-origin' })
}

/** The signed-in person's name, their diagrams, and the one they chose. Everything comes through this app's server. */
export function Library() {
  const [answer, setAnswer] = useState<LibraryAnswer | null>(null)
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null)
  const [said, setSaid] = useState('')

  useEffect(() => {
    let current = true
    fetch('/api/library', { credentials: 'same-origin' })
      .then((response) => response.json() as Promise<LibraryAnswer>)
      .catch((): LibraryAnswer => ({ failure: { status: 0, errorCode: 'example.offline', message: 'The server could not be reached.' } }))
      .then((next) => {
        if (current) setAnswer(next)
      })
    return () => {
      current = false
    }
  }, [])

  const signOut = (
    <form method="post" action="/auth/signout">
      <button type="submit" className="quiet">
        Sign out
      </button>
    </form>
  )

  if (answer === null) return <p role="status">Reading your library</p>
  if ('failure' in answer) {
    return (
      <div className="notice" role="alert">
        <p>
          {answer.failure.message} <code>{answer.failure.errorCode}</code>
        </p>
        {answer.failure.status === 401 ? (
          <a className="signin" href="/auth/plotwork">
            Sign in with Plotwork
          </a>
        ) : (
          signOut
        )}
      </div>
    )
  }

  return (
    <div className="library">
      <div className="who">
        <p>
          Signed in as <strong>{answer.name ?? 'your Plotwork account'}</strong>
          {answer.organisation === null ? null : <> for {answer.organisation}</>}
        </p>
        {signOut}
      </div>
      {answer.diagrams.length === 0 ? (
        <p className="notice">Nothing published yet. Publish a diagram from your agent, the command line or the portal, and it shows here.</p>
      ) : (
        <div className="picker">
          <ul aria-label="Your diagrams">
            {answer.diagrams.map((diagram) => {
              const name = diagram.name ?? diagram.id
              return (
                <li key={diagram.id}>
                  <button type="button" aria-pressed={chosen?.id === diagram.id} onClick={() => setChosen({ id: diagram.id, name })}>
                    <span>{name}</span>
                    {diagram.folder === null ? null : <span className="folder">{diagram.folder}</span>}
                  </button>
                </li>
              )
            })}
            {answer.more ? <li className="folder">The first 50 are shown.</li> : null}
          </ul>
          <div className="result">
            {chosen === null ? (
              <p className="notice">Choose a diagram to show it.</p>
            ) : (
              <>
                <PlotworkDiagram
                  src={`/api/picture/${encodeURIComponent(chosen.id)}`}
                  fetch={sameOrigin}
                  label={chosen.name}
                  className="diagram"
                  onLoad={() => setSaid(`Showing ${chosen.name}.`)}
                  onError={({ reason }) => setSaid(`The picture could not be shown (${reason}).`)}
                />
                <p className="status" role="status">
                  {said}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
