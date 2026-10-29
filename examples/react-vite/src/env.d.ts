interface ImportMetaEnv {
  /** A public stable link to follow live, such as `https://cdn.plotwork.dev/l/<token>.svg`. Optional. */
  readonly VITE_PLOTWORK_STABLE_LINK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
