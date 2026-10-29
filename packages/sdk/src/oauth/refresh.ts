import { refreshToken } from './tokens.js'
import type { ClientOptions, TokenSet } from './tokens.js'

/**
 * An `accessToken` function for the client that keeps one grant's tokens fresh, wherever the app keeps them. It refreshes a minute
 * before the access token ends, sends one refresh however many calls ask at once, and hands each new set to `onRefresh` so the app
 * saves the rotated refresh token. Use one per grant: two refreshers of the same refresh token end the grant, as a stolen copy would.
 */

export interface WithRefreshOptions extends Omit<ClientOptions, 'signal'> {
  /** Called with each new set; save its `refreshToken`, since the one before stops working. A promise is awaited. */
  onRefresh: (tokens: TokenSet) => void | Promise<void>
  /** How long before the access token ends to refresh it, in milliseconds: a minute by default. */
  leewayMs?: number | undefined
}

/** What `withRefresh` returns: a function for the client's `accessToken`, with the tokens it holds now. */
export interface RefreshingToken {
  (): Promise<string>
  /** The tokens held now, after any refresh. */
  current(): TokenSet
}

export function withRefresh(tokens: TokenSet, options: WithRefreshOptions): RefreshingToken {
  let current = tokens
  let pending: Promise<TokenSet> | null = null
  const leeway = options.leewayMs ?? 60_000
  const { onRefresh, leewayMs: _unused, ...client } = options

  const refresh = (): Promise<TokenSet> => {
    pending ??= (async () => {
      try {
        const next = await refreshToken({ ...client, refreshToken: current.refreshToken })
        current = next
        await onRefresh(next)
        return next
      } finally {
        pending = null
      }
    })()
    return pending
  }

  const token = async (): Promise<string> => {
    if (pending === null && Date.now() < current.expiresAt - leeway) return current.accessToken
    return (await refresh()).accessToken
  }
  return Object.assign(token, { current: () => current })
}
