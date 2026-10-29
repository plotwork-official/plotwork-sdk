'use client'

import { PlotworkDiagram } from '@plotwork.official/viewer/react'
import { useState } from 'react'

/** A stable link followed live. It renders as the bare element on the server and comes alive in the browser. */
export function LiveDiagram({ src }: { src: string }) {
  const [said, setSaid] = useState('')
  return (
    <>
      <PlotworkDiagram
        src={src}
        live
        label="A diagram followed live from its stable link"
        className="diagram"
        onLoad={({ fingerprint }) => setSaid(`Showing ${fingerprint.slice(0, 19)}`)}
        onChange={({ fingerprint }) => setSaid(`A new version arrived: ${fingerprint.slice(0, 19)}`)}
        onError={({ reason }) => setSaid(`The link could not be shown (${reason}).`)}
      />
      <p className="status" role="status">
        {said}
      </p>
    </>
  )
}
