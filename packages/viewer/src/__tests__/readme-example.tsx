// Type-checked by `tsc --noEmit`: the README's React examples for private pictures and the library picker. Never run.
import { useState } from 'react'
import type { ReactElement } from 'react'

import { PlotworkDiagram, PlotworkLibrary } from '../react/index.js'

export function PrivatePicture({ id, token }: { id: string; token: () => Promise<string> }): ReactElement {
  return <PlotworkDiagram src={`https://api.plotwork.dev/v1/library/${id}.svg`} token={token} live />
}

export function Picker({ token }: { token: () => Promise<string> }): ReactElement {
  const [picture, setPicture] = useState<string | null>(null)
  return (
    <>
      <PlotworkLibrary token={token} onSelect={({ pictureUrl }) => setPicture(pictureUrl)} />
      {picture !== null && <PlotworkDiagram src={picture} token={token} live />}
    </>
  )
}
