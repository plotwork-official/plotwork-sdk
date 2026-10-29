import { connection } from 'next/server'

import { CHECKOUT } from '@/lib/checkout'

import { LiveDiagram } from './live-diagram'
import { Playground } from './playground'

/** The page: a playground that draws on the server, and a stable link followed live when one is set. */
export default async function Home() {
  // Read the environment when the page is asked for, not when it is built, so a key added later is seen.
  await connection()
  const hasKey = Boolean(process.env.PLOTWORK_API_KEY)
  const stableLink = process.env.NEXT_PUBLIC_PLOTWORK_STABLE_LINK

  return (
    <main>
      <header>
        <h1>Plotwork with Next.js</h1>
        <p>
          Write a diagram and draw it. The route handler checks and draws it with <code>@plotwork.official/sdk</code> on the server,
          and <code>&lt;PlotworkDiagram&gt;</code> shows it: hover a box to trace its lines.
        </p>
      </header>

      <section aria-labelledby="playground">
        <h2 id="playground">Playground</h2>
        {hasKey ? (
          <Playground initialSource={CHECKOUT} />
        ) : (
          <div className="notice" role="note">
            <p>
              <strong>Add your API key to draw.</strong> Make a key on the Keys page of{' '}
              <a href="https://app.plotwork.dev">app.plotwork.dev</a>, then:
            </p>
            <pre>
              <code>{'cp .env.example .env.local\n# set PLOTWORK_API_KEY in .env.local, then restart\nnpm run dev'}</code>
            </pre>
            <p>The key stays on this server. The browser only ever sees the picture.</p>
          </div>
        )}
      </section>

      {stableLink ? (
        <section aria-labelledby="live">
          <h2 id="live">Live from a stable link</h2>
          <p>
            <code>live</code> checks the link every minute while the page is in view, and swaps in a new version when one is published.
          </p>
          <LiveDiagram src={stableLink} />
        </section>
      ) : null}
    </main>
  )
}
