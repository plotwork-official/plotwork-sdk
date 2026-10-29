import { PlotworkDiagram } from '@plotwork.official/viewer/react'
import { useState } from 'react'

import checkout, { fingerprint } from './diagrams/checkout.diagram'
import checkoutSource from './diagrams/checkout.diagram?raw'
import { Playground } from './Playground'

const stableLink = import.meta.env.VITE_PLOTWORK_STABLE_LINK

/** The page: a diagram bundled at build time, a playground that draws through the API, and a stable link followed live. */
export function App() {
  const [said, setSaid] = useState('Hover a box to trace its lines. Press Web tier to drill into its part.')
  const [live, setLive] = useState('')

  return (
    <main>
      <header>
        <h1>Plotwork with React and Vite</h1>
        <p>
          A <code>.diagram</code> file imported through <code>@plotwork.official/vite</code>, a playground that draws through{' '}
          <code>@plotwork.official/sdk</code>, and both shown with <code>&lt;PlotworkDiagram&gt;</code>.
        </p>
      </header>

      <section aria-labelledby="bundled">
        <h2 id="bundled">Bundled at build time</h2>
        <p>
          <code>src/diagrams/checkout.diagram</code>, drawn by the Plotwork command line when Vite builds. Save the file and the picture
          updates. Fingerprint <code>{fingerprint.slice(0, 19)}</code>.
        </p>
        <PlotworkDiagram
          svg={checkout}
          label="Checkout flow"
          className="diagram"
          onTrace={({ id }) => setSaid(id === null ? 'Nothing traced.' : `Tracing ${id}.`)}
          onDrill={({ part, name }) => setSaid(`Drill: open part ${part} for ${name}.`)}
        />
        <p className="status" role="status">
          {said}
        </p>
      </section>

      <section aria-labelledby="playground">
        <h2 id="playground">Playground</h2>
        <p>Drawn by the Plotwork API. The browser calls this dev server, which adds your key from .env.local on the way.</p>
        <Playground initialSource={checkoutSource} />
      </section>

      {stableLink ? (
        <section aria-labelledby="live">
          <h2 id="live">Live from a stable link</h2>
          <p>
            <code>live</code> checks the link every minute while the page is in view, and swaps in a new version when one is published.
          </p>
          <PlotworkDiagram
            src={stableLink}
            live
            label="A diagram followed live from its stable link"
            className="diagram"
            onLoad={(detail) => setLive(`Showing ${detail.fingerprint.slice(0, 19)}`)}
            onChange={(detail) => setLive(`A new version arrived: ${detail.fingerprint.slice(0, 19)}`)}
            onError={({ reason }) => setLive(`The link could not be shown (${reason}).`)}
          />
          <p className="status" role="status">
            {live}
          </p>
        </section>
      ) : null}
    </main>
  )
}
