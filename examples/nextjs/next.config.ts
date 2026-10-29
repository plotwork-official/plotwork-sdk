import type { NextConfig } from 'next'

const config: NextConfig = {
  // The example runs on its own; this stops Next from treating the SDK repository around it as the workspace root.
  outputFileTracingRoot: import.meta.dirname,
}

export default config
