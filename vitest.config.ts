import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.{eval,test}.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
})
