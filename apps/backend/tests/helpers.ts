import type { Express } from 'express';
import request from 'supertest';
import { Role } from '@prisma/client';
import { prisma } from '../src/config/database';
import { CLIENT_HEADER, CLIENT_HEADER_VALUE } from '../src/middleware/origin.middleware';
import { addDays, today } from '../src/utils/calendar';

export const CLIENT_HEADERS = { [CLIENT_HEADER]: CLIENT_HEADER_VALUE };
export const VALID_PASSWORD = 'correct horse battery staple';

/**
 * Remove all rows between tests. Safe because tests/env.setup.ts has already
 * refused to run unless DATABASE_URL names a `*_test` database.
 * TRUNCATE ... CASCADE resets everything in one statement and keeps the schema.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "shortlist_entries", "shortlist_folders", "applications", "casting_roles", "portfolio_items", "refresh_tokens", "profile_skills", "experiences", "profiles", "skills", "users" RESTART IDENTITY CASCADE'
  );
}

/** A calendar date `offsetDays` from today in the platform time zone, as `YYYY-MM-DD`. */
export function dateFromToday(offsetDays: number): string {
  return addDays(today(), offsetDays).toISOString().slice(0, 10);
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

/** A complete, valid casting role body. Spread and override per test. */
export const CASTING_ROLE_INPUT = {
  title: 'Lead — Meera, investigative journalist',
  description:
    'Meera uncovers a coastal land scam while her newspaper is being sold. Feature film, 40-day schedule.',
  requirements: 'Female, 25–32. Fluent in Malayalam and English. Comfortable with night shoots.',
  compensation: '₹15,000 per shooting day',
  location: 'Kochi, Kerala',
  seekingRole: Role.ACTOR as Role,
  applicationDeadline: null as string | null,
};

export type CastingRoleInputBody = typeof CASTING_ROLE_INPUT;

/** The fields of a casting role response the tests read. */
export interface CastingRoleBody {
  id: string;
  title: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  publishedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
  isOwner: boolean;
  [key: string]: unknown;
}

/** Create a casting role through the real endpoint, optionally publishing it. */
export async function createCastingRole(
  app: Express,
  accessToken: string,
  overrides: Partial<CastingRoleInputBody> = {},
  options: { publish?: boolean } = {}
): Promise<CastingRoleBody> {
  const created = await request(app)
    .post('/api/v1/casting')
    .set(bearer(accessToken))
    .send({ ...CASTING_ROLE_INPUT, ...overrides });
  if (created.status !== 201) {
    throw new Error(`createCastingRole failed: ${created.status} ${JSON.stringify(created.body)}`);
  }

  if (!options.publish) return created.body.data.castingRole as CastingRoleBody;

  const published = await request(app)
    .patch(`/api/v1/casting/${created.body.data.castingRole.id}/status`)
    .set(bearer(accessToken))
    .send({ status: 'OPEN' });
  if (published.status !== 200) {
    throw new Error(`publish failed: ${published.status} ${JSON.stringify(published.body)}`);
  }
  return published.body.data.castingRole as CastingRoleBody;
}

/** POST /casting/:id/applications as the holder of `accessToken`. */
export function applyTo(app: Express, accessToken: string, castingRoleId: string) {
  return request(app)
    .post(`/api/v1/casting/${castingRoleId}/applications`)
    .set(bearer(accessToken));
}
