import { Plotwork, PlotworkApiError } from '@plotwork.official/sdk'
import type { Diagnostic } from '@plotwork.official/sdk'
import { PlotworkDiagram } from '@plotwork.official/viewer/react'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * No key here: the client calls `/v1/...` on the page's own origin, and the dev server (`vite.config.ts`) forwards it to the
 * Plotwork API with the key from `.env.local`. A deployed app would call the API from its own server instead.
 */
const plotwork = new Plotwork({ baseUrl: location.origin })

type Outcome = { kind: 'drawn' } | { kind: 'mistakes'; errors: Diagnostic[] } | { kind: 'no-key' } | { kind: 'failed'; message: string; errorCode: string }

export function Playground({ initialSource }: { initialSource: string }) {
  const [source, setSource] = useState(initialSource)
  const [svg, setSvg] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)
  const editor = useRef<HTMLTextAreaElement>(null)

  const draw = useCallback(async (text: string) => {
    setBusy(true)
    try {
      // A mistake in the diagram is part of the answer, with a line, a column and a hint; it never throws.
      const checked = await plotwork.diagrams.validate({ source: text })
      if (!checked.valid) {
        setOutcome({ kind: 'mistakes', errors: checked.errors })
        return
      }
      const drawn = await plotwork.diagrams.render({ source: text, scheme: 'auto' })
      setSvg(drawn.svg)
      setOutcome({ kind: 'drawn' })
    } catch (error) {
      if (error instanceof PlotworkApiError && error.errorCode === 'auth.missing') setOutcome({ kind: 'no-key' })
      else if (error instanceof PlotworkApiError) setOutcome({ kind: 'failed', message: error.message, errorCode: error.errorCode })
      else throw error
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void draw(initialSource)
  }, [draw, initialSource])

  /** Puts the cursor where a mistake is. */
  function select(line: number, column: number) {
    const area = editor.current
    if (area === null) return
    const offset = source.split('\n').slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0) + column - 1
    area.focus()
    area.setSelectionRange(offset, offset)
  }

  if (outcome?.kind === 'no-key') {
    return (
      <div className="notice" role="note">
        <p>
          <strong>Add your API key to draw.</strong> Make a key on the Keys page of <a href="https://app.plotwork.dev">app.plotwork.dev</a>,
          then:
        </p>
        <pre>
          <code>{'cp .env.example .env.local\n# set PLOTWORK_API_KEY in .env.local, then restart\nnpm run dev'}</code>
        </pre>
        <p>The key stays on the dev server. The browser only ever sees the picture.</p>
      </div>
    )
  }

  return (
    <div className="playground">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void draw(source)
        }}
      >
        <label htmlFor="source">Diagram source</label>
        <textarea id="source" ref={editor} value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false} rows={12} />
        <button type="submit" disabled={busy}>
          {busy ? 'Drawing' : 'Draw'}
        </button>
      </form>

      <div className="result">
        {outcome?.kind === 'mistakes' ? (
          <ul className="errors" aria-label="Mistakes in the diagram">
            {outcome.errors.map((error) => (
              <li key={`${error.line}:${error.column}:${error.code}`}>
                <button type="button" className="at" onClick={() => select(error.line, error.column)}>
                  Line {error.line}, column {error.column}
                </button>
                <span>{error.message}</span>
                {error.hint === null ? null : <span className="hint">{error.hint}</span>}
              </li>
            ))}
          </ul>
        ) : null}
        {outcome?.kind === 'failed' ? (
          <p className="notice" role="alert">
            {outcome.message} <code>{outcome.errorCode}</code>
          </p>
        ) : null}
        <PlotworkDiagram svg={svg} label="The diagram you drew" className="diagram" />
      </div>
    </div>
  )
}
