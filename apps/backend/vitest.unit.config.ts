import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit',
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/env.setup.ts'],
    // A run that collects nothing is a configuration bug, not a pass.
    passWithNoTests: false,
  },
});
