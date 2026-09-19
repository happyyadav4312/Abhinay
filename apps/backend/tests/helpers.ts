import type { Express } from 'express';
import request from 'supertest';
import { Role } from '@prisma/client';
import { prisma } from '../src/config/database';
import { CLIENT_HEADER, CLIENT_HEADER_VALUE } from '../src/middleware/origin.middleware';

export const CLIENT_HEADERS = { [CLIENT_HEADER]: CLIENT_HEADER_VALUE };
export const VALID_PASSWORD = 'correct horse battery staple';

/**
 * Remove all rows between tests. Safe because tests/env.setup.ts has already
 * refused to run unless DATABASE_URL names a `*_test` database.
 * TRUNCATE ... CASCADE resets everything in one statement and keeps the schema.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "refresh_tokens", "profile_skills", "experiences", "profiles", "skills", "users" RESTART IDENTITY CASCADE'
  );
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

let emailCounter = 0;
export function uniqueEmail(prefix = 'user'): string {
  emailCounter += 1;
  return `${prefix}.${Date.now()}.${emailCounter}@example.test`;
}

export interface RegisteredUser {
  userId: string;
  profileId: string;
  name: string;
  email: string;
  password: string;
  accessToken: string;
  refreshCookie: string;
}

/** Extract a single Set-Cookie value by name from a supertest response. */
export function cookieFromResponse(res: request.Response, name: string): string | undefined {
  const header = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(header) ? header : header ? [header] : [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

/** Register a user through the real HTTP endpoint and return usable credentials. */
export async function registerUser(
  app: Express,
  overrides: Partial<{ name: string; email: string; password: string; role: Role }> = {}
): Promise<RegisteredUser> {
  const payload = {
    name: overrides.name ?? 'Test Professional',
    email: overrides.email ?? uniqueEmail(),
    password: overrides.password ?? VALID_PASSWORD,
    role: overrides.role ?? Role.ACTOR,
  };

  const res = await request(app).post('/api/v1/auth/register').send(payload);
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const profile = await prisma.profile.findUniqueOrThrow({
    where: { userId: res.body.data.user.id },
    select: { id: true },
  });

  return {
    userId: res.body.data.user.id,
    profileId: profile.id,
    name: payload.name,
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
    accessToken: res.body.data.accessToken,
    refreshCookie: cookieFromResponse(res, 'refreshToken') ?? '',
  };
}

/**
 * Promote a fixture user to ADMIN directly in the database. There is no API for
 * this by design — role promotion is deliberately not an exposed operation.
 */
export async function makeAdmin(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { role: Role.ADMIN } });
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
