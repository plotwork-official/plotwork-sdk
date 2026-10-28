import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 4),
  },
})
