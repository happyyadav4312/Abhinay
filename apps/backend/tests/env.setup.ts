import path from 'path';
import dotenv from 'dotenv';

/**
 * Loads .env.test for every test worker, with `override` so a developer's
 * ambient shell variables (or a previously loaded .env) cannot redirect the
 * suite at the development database.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

dotenv.config({ path: path.join(REPO_ROOT, '.env.test'), override: true });

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.test.example to .env.test and point it at a dedicated test database.'
  );
}

/**
 * Hard safety rail. The integration suite truncates tables between tests, so it
 * refuses to run unless the target database is unmistakably a test database.
 */
const databaseName = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, '');

if (!databaseName.endsWith('_test')) {
  throw new Error(
    `Refusing to run tests against database "${databaseName}". ` +
      'The test DATABASE_URL must point at a database whose name ends in "_test".'
  );
}

process.env.NODE_ENV = 'test';
