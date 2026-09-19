import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { PrismaClient, Role } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const prisma = new PrismaClient();

/**
 * Optional development seed for a demo ADMIN account.
 *
 * It only does anything when BOTH SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are
 * supplied by the operator. There is no hardcoded fallback password, and the
 * seed refuses to run against NODE_ENV=production — a demo admin must never be
 * created as a side effect of a real deployment.
 */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('Refusing to seed a demo admin in production. Nothing was changed.');
    return;
  }

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      'Skipping admin seed: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env to create one.'
    );
    return;
  }

  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('SEED_ADMIN_PASSWORD must be 12-72 bytes, matching the API password policy.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists: ${existing.email}`);
    return;
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const user = await prisma.user.create({
    data: {
      name: process.env.SEED_ADMIN_NAME?.trim() || 'Abhinay Admin',
      email,
      passwordHash: await bcrypt.hash(password, rounds),
      role: Role.ADMIN,
      profile: { create: {} },
    },
    select: { id: true, email: true },
  });

  console.log(`Admin created: ${user.email} (${user.id})`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
