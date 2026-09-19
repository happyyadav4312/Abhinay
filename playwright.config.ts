import path from 'path';
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

/**
 * Browser tests run the real stack: a Next.js production server talking to the
 * Express API, which talks to the dedicated `*_test` PostgreSQL database.
 *
 * Nothing here touches the development database — the API is started with
 * .env.test, the same file the integration suite uses.
 */
const REPO_ROOT = __dirname;
const testEnvPath = path.join(REPO_ROOT, '.env.test');
const testEnv = dotenv.config({ path: testEnvPath }).parsed;

if (!testEnv?.DATABASE_URL) {
  throw new Error(
    'Missing .env.test. Copy .env.test.example to .env.test and point it at a dedicated test database.'
  );
}

const databaseName = new URL(testEnv.DATABASE_URL).pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  throw new Error(`Refusing to run E2E against "${databaseName}": it must end in "_test".`);
}

const API_PORT = 5100;
const WEB_PORT = 3100;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

/** Ports differ from the dev defaults so a running `npm run dev` is not disturbed. */
const apiEnv = {
  ...process.env,
  ...testEnv,
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  FRONTEND_URL: WEB_URL,
  PUBLIC_SERVER_URL: API_URL,
  STORAGE_ROOT: 'storage-e2e',
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  globalSetup: './tests/e2e/global-setup.ts',

  webServer: [
    {
      // `node dist/server.js` directly, not the `start` script: that script
      // loads the development .env, which would point the API at the
      // development database.
      command: 'npm run build --workspace=apps/backend && node apps/backend/dist/server.js',
      url: `${API_URL}/api/v1/health`,
      cwd: REPO_ROOT,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // NEXT_PUBLIC_* values are inlined at build time, so the client must be
      // rebuilt against the E2E API port rather than reusing a build made with
      // the development URL. `next build` writes to .next while `next dev`
      // writes to .next/dev, so a running dev server is not disturbed.
      command: `npx next build && npx next start --port ${WEB_PORT}`,
      url: WEB_URL,
      cwd: path.join(REPO_ROOT, 'apps', 'frontend'),
      env: { ...process.env, NEXT_PUBLIC_API_URL: `${API_URL}/api/v1` },
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
