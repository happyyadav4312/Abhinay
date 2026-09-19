import path from 'path';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND_ROOT = path.resolve(__dirname, '..');

/**
 * Applies the committed migrations to the test database once per run, using the
 * same `prisma migrate deploy` that a real deployment would use. Integration
 * coverage therefore exercises the actual migration history rather than a
 * `db push` approximation of the schema.
 */
export async function setup(): Promise<void> {
  const parsed = dotenv.config({ path: path.join(REPO_ROOT, '.env.test'), override: true });

  const databaseUrl = parsed.parsed?.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing. Create .env.test from .env.test.example.');
  }

  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to migrate "${databaseName}": test databases must end in "_test".`);
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
