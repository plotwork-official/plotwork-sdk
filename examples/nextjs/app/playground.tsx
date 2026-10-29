'use client'

import { PlotworkDiagram } from '@plotwork.official/viewer/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { DrawAnswer } from '@/lib/draw'

/** A textarea, a Draw button, and the picture or the mistakes the API found. */
export function Playground({ initialSource }: { initialSource: string }) {
  const [source, setSource] = useState(initialSource)
  const [answer, setAnswer] = useState<DrawAnswer | null>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const editor = useRef<HTMLTextAreaElement>(null)

  const draw = useCallback(async (text: string) => {
    setBusy(true)
    try {
      const response = await fetch('/api/draw', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: text }) })
      const next = (await response.json()) as DrawAnswer
      setAnswer(next)
      if ('svg' in next) setSvg(next.svg)
    } catch {
      setAnswer({ failure: { status: 0, errorCode: 'example.offline', message: 'The server could not be reached.' } })
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
    const lines = source.split('\n')
    const offset = lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0) + column - 1
    area.focus()
    area.setSelectionRange(offset, offset)
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
        {answer !== null && 'errors' in answer ? (
          <ul className="errors" aria-label="Mistakes in the diagram">
            {answer.errors.map((error) => (
              <li key={`${error.line}:${error.column}:${error.message}`}>
                <button type="button" className="at" onClick={() => select(error.line, error.column)}>
                  Line {error.line}, column {error.column}
                </button>
                <span>{error.message}</span>
                {error.hint === null ? null : <span className="hint">{error.hint}</span>}
              </li>
            ))}
          </ul>
        ) : null}
        {answer !== null && 'failure' in answer ? (
          <p className="notice" role="alert">
            {answer.failure.message} <code>{answer.failure.errorCode}</code>
          </p>
        ) : null}
        <PlotworkDiagram svg={svg} label="The diagram you drew" className="diagram" />
      </div>
    </div>
  )
}
