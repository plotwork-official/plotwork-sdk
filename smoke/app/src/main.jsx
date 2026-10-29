/**
 * The customer's app the smoke test builds: a React page that shows a `.diagram` file bundled by the Vite plugin and, when the
 * address has `?live=<stable link>`, the same diagram followed live from the CDN. Every load and change the viewers report is kept
 * in `window.smoke` for the browser check to read.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { PlotworkDiagram } from '@plotwork.official/viewer/react'
import checkout, { fingerprint } from './checkout.diagram'

const live = new URLSearchParams(location.search).get('live')
const smoke = { bundled: fingerprint, events: [] }
window.smoke = smoke

const record = (id, name) => (detail) => smoke.events.push({ id, name, ...detail })

function App() {
  return (
    <main style={{ display: 'grid', gap: 16, padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Plotwork SDK smoke test</h1>
      <h2 style={{ margin: 0, fontSize: 15 }}>A .diagram file bundled by @plotwork.official/vite</h2>
      <PlotworkDiagram svg={checkout} label="Checkout, bundled" onLoad={record('bundled', 'load')} onError={record('bundled', 'error')} style={{ height: 360 }} />
      {live === null ? null : <h2 style={{ margin: 0, fontSize: 15 }}>The stable link, live from the CDN</h2>}
      {live === null ? null : (
        <PlotworkDiagram
          src={live}
          live
          interval={15}
          label="Checkout, live"
          onLoad={record('live', 'load')}
          onChange={record('live', 'change')}
          onError={record('live', 'error')}
          style={{ height: 360 }}
        />
      )}
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
