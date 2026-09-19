import path from 'path';
import fs from 'fs/promises';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Bring the E2E database and upload directory to a known clean state before the
 * servers start. The `*_test` guard is repeated here because this is the code
 * that actually destroys data.
 */
export default async function globalSetup(): Promise<void> {
  const testEnv = dotenv.config({ path: path.join(REPO_ROOT, '.env.test') }).parsed;
  const databaseUrl = testEnv?.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL in .env.test.');
  }

  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to reset "${databaseName}": E2E databases must end in "_test".`);
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: path.join(REPO_ROOT, 'apps', 'backend'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  await fs.rm(path.join(REPO_ROOT, 'storage-e2e'), { recursive: true, force: true });
}
