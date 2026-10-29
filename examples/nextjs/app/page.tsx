import { cookies } from 'next/headers'
import { connection } from 'next/server'

import { CHECKOUT } from '@/lib/checkout'
import { readSession, signInConfig } from '@/lib/sign-in'

import { Library } from './library'
import { LiveDiagram } from './live-diagram'
import { Playground } from './playground'

/** What the page says when a sign-in came back refused, by OAuth's code. */
const SIGN_IN_REFUSALS: Record<string, string> = {
  access_denied: 'You chose not to connect the app, so nothing was shared.',
  expired: 'The sign-in took longer than ten minutes, or was finished in another browser. Start it again.',
  invalid_state: 'The answer from Plotwork was not the one this browser asked for, so it was ignored. Start again.',
  invalid_grant: 'The sign-in code was used already or ran out. Start again.',
  invalid_client: 'Plotwork did not accept the client id or secret. Check PLOTWORK_CLIENT_ID and PLOTWORK_CLIENT_SECRET.',
  not_configured: 'Sign in with Plotwork is not set up yet. See below.',
}

/** The page: Sign in with Plotwork and the person's library, a playground that draws with a key, and a stable link followed live. */
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Read the environment when the page is asked for, not when it is built, so a key added later is seen.
  await connection()
  const hasKey = Boolean(process.env.PLOTWORK_API_KEY)
  const stableLink = process.env.NEXT_PUBLIC_PLOTWORK_STABLE_LINK
  const config = signInConfig()
  const signedIn = config !== null && (await readSession(config, await cookies())) !== null
  const refused = (await searchParams).signin
  // Only a known message, or OAuth's code, is shown: the address is anyone's to write.
  const refusal = typeof refused !== 'string' ? null : (SIGN_IN_REFUSALS[refused] ?? `The sign-in did not finish${/^[a-z_]{1,40}$/.test(refused) ? ` (${refused})` : ''}.`)

  return (
    <main>
      <header>
        <h1>Plotwork with Next.js</h1>
        <p>
          Two ways to use Plotwork from a server. Sign in with Plotwork lets each person show their own diagrams with their own token. An API
          key draws as your account. Both stay on this server; the browser only ever sees pictures.
        </p>
      </header>

      <section aria-labelledby="sign-in">
        <h2 id="sign-in">Sign in with Plotwork</h2>
        <p>
          A person approves this app on Plotwork once. The server keeps their tokens in a sealed cookie, lists their library with{' '}
          <code>plotwork.library.list()</code>, and passes the picture they choose on to <code>&lt;PlotworkDiagram&gt;</code>.
        </p>
        {refusal === null ? null : (
          <p className="notice" role="alert">
            {refusal}
          </p>
        )}
        {config === null ? (
          <div className="notice" role="note">
            <p>
              <strong>Register an app to sign in.</strong> On <a href="https://app.plotwork.dev">app.plotwork.dev</a>, open Developers, then
              Developer apps, and register a confidential app with the redirect address <code>http://localhost:3000/auth/plotwork/callback</code>.
              Then:
            </p>
            <pre>
              <code>
                {
                  'cp .env.example .env.local\n# set PLOTWORK_CLIENT_ID, PLOTWORK_CLIENT_SECRET, APP_URL and SESSION_SECRET\n# (openssl rand -base64 32), then restart\nnpm run dev'
                }
              </code>
            </pre>
          </div>
        ) : signedIn ? (
          <Library />
        ) : (
          <a className="signin" href="/auth/plotwork">
            <picture>
              <source media="(prefers-color-scheme: dark)" srcSet="https://assets.plotwork.dev/brand/logo/plotwork-mark-on-dark.svg" />
              <img src="https://assets.plotwork.dev/brand/logo/plotwork-mark-on-light.svg" alt="" width={20} height={20} />
            </picture>
            Sign in with Plotwork
          </a>
        )}
      </section>

      <section aria-labelledby="playground">
        <h2 id="playground">Playground</h2>
        <p>
          Drawn with an API key. The route handler checks and draws the diagram with <code>@plotwork.official/sdk</code> on the server, and{' '}
          <code>&lt;PlotworkDiagram&gt;</code> shows it: hover a box to trace its lines.
        </p>
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
