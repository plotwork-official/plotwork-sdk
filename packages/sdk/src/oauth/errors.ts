/** The production API, which is also the authorization server. */
export const DEFAULT_OAUTH_BASE_URL = 'https://api.plotwork.dev'

/**
 * A refusal from the authorization server (OAuth's `{ error, error_description }`), or what the helper knew when there was none.
 * `error` is OAuth's own code (`invalid_grant`, `invalid_client`, `access_denied`), or one of the helper's: `invalid_state`,
 * `invalid_issuer`, `invalid_response`, `request_failed` and `request_timeout`.
 */
export class PlotworkOAuthError extends Error {
  readonly error: string
  readonly description: string
  /** The HTTP status, or 0 when no answer came or the mistake was found in a redirect. */
  readonly status: number

  constructor(error: string, description: string, status: number) {
    super(description === '' ? error : `${error}: ${description}`)
    this.name = 'PlotworkOAuthError'
    this.error = error
    this.description = description
    this.status = status
  }
}

/** The address of an endpoint on the API, keeping a base address's path. */
export function endpointOf(baseUrl: string | undefined, path: string): string {
  const base = baseUrl ?? DEFAULT_OAUTH_BASE_URL
  return new URL(path.replace(/^\/+/, ''), base.endsWith('/') ? base : `${base}/`).href
}
