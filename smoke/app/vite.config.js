import { defineConfig } from 'vite'
import { plotwork } from '@plotwork.official/vite'

export default defineConfig({
  plugins: [plotwork()],
  esbuild: { jsx: 'automatic' },
})
