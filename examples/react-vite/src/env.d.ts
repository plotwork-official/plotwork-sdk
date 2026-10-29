interface ImportMetaEnv {
  /** A public stable link to follow live, such as `https://cdn.plotwork.dev/l/<token>.svg`. Optional. */
  readonly VITE_PLOTWORK_STABLE_LINK?: string
  /** The client id of a public app registered for Sign in with Plotwork. Public: it is in the bundle. Optional. */
  readonly VITE_PLOTWORK_CLIENT_ID?: string
  /** The API to sign in with and read the library from: production unless set, such as `https://api-preview.plotwork.dev`. */
  readonly VITE_PLOTWORK_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
