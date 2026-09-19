import type { Server } from 'http';
import app from './app';
import { env } from './config/env';
import { prisma } from './config/database';
import { ensureStorageReady } from './config/storage';

let server: Server | undefined;
let shuttingDown = false;

async function start(): Promise<void> {
  // Fail fast: a server that cannot reach PostgreSQL cannot serve a single
  // useful request, and starting anyway just turns a clear startup error into
  // a stream of confusing 500s.
  try {
    await prisma.$connect();
    console.log('Database connected');
  } catch (error) {
    console.error('Database connection failed. Is PostgreSQL running?');
    console.error('  Native install : check the postgresql service');
    console.error('  Docker         : docker compose up -d');
    if (error instanceof Error) console.error(`  Error: ${error.message}`);
    process.exitCode = 1;
    await prisma.$disconnect().catch(() => undefined);
    return;
  }

  await ensureStorageReady();

  server = app.listen(env.PORT, () => {
    console.log(
      [
        '',
        '  Abhinay API',
        '  ─────────────────────────────',
        `  Environment : ${env.NODE_ENV}`,
        `  Port        : ${env.PORT}`,
        `  Client      : ${env.FRONTEND_URL}`,
        `  Health      : ${env.PUBLIC_SERVER_URL}/api/v1/health`,
        '  ─────────────────────────────',
        '',
      ].join('\n')
    );
  });
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n${signal} received, shutting down...`);

  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
  await prisma.$disconnect().catch(() => undefined);

  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

void start();
