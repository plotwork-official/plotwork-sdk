import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 4),
  },
})
