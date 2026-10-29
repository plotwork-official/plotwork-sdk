import { plotwork } from '@plotwork.official/vite'
import { defineConfig, loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'

/**
 * `.diagram` imports are drawn by the Plotwork command line at build time (`plotwork()`).
 *
 * The playground calls `/v1/...` on this server, which forwards it to the Plotwork API and adds the key from `.env.local`. The key
 * has no `VITE_` prefix, so Vite never puts it in the bundle. This proxy is for local development and `vite preview` only: a
 * deployed app calls the API from its own server.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.PLOTWORK_BASE_URL || 'https://api.plotwork.dev'
  const apiKey = env.PLOTWORK_API_KEY ?? ''
  const proxy: Record<string, ProxyOptions> = {
    '/v1': {
      target,
      changeOrigin: true,
      headers: apiKey === '' ? {} : { 'X-API-Key': apiKey },
    },
  }
  return {
    plugins: [plotwork()],
    esbuild: { jsx: 'automatic' },
    server: { proxy },
    preview: { proxy },
  }
})
