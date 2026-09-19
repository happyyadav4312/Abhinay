import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/env.setup.ts'],
    globalSetup: ['tests/global.setup.ts'],
    // Files share one PostgreSQL database and truncate between tests, so they
    // run one at a time rather than racing each other.
    fileParallelism: false,
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    passWithNoTests: false,
  },
});
