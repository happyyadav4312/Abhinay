import { PrismaClient } from '@prisma/client';

/**
 * One PrismaClient for the process. `tsx watch` re-evaluates modules on every
 * save, so without the global cache each reload would open a new connection
 * pool and eventually exhaust PostgreSQL's connection limit.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function logLevels(): ('query' | 'error' | 'warn')[] {
  switch (process.env.NODE_ENV) {
    case 'development':
      return ['query', 'error', 'warn'];
    // Constraint violations are expected and asserted on in the test suite;
    // logging them would bury the real results in noise.
    case 'test':
      return [];
    default:
      return ['error'];
  }
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: logLevels() });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
