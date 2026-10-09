import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { CastingRoleStatus, PortfolioMediaKind, Role, StorageProvider } from '@prisma/client';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { DEMO_EMAIL_DOMAIN, demoLogins, seedDemo } from '../../prisma/seed-demo';
import { bearer, disconnect, registerUser, resetDatabase } from '../helpers';

/**
 * The demo seed against the test database: it must produce data the real API
 * accepts and could itself have produced, and it must never touch anyone else.
 */

const quiet = { log: () => undefined };

beforeEach(resetDatabase);
afterAll(disconnect);

describe('demo seed', () => {
  it('creates members, roles, applications and folders, and runs only once', async () => {
    const first = await seedDemo(prisma, quiet);
    expect(first).toMatchObject({ created: true, members: 17, castingRoles: 10 });
    expect(first.applications).toBeGreaterThan(10);
    expect(first.folders).toBe(4);

    const second = await seedDemo(prisma, quiet);
    expect(second.created).toBe(false);
    expect(await prisma.user.count()).toBe(17);
  });

  it('only ever creates applications the real rules would allow', async () => {
    await seedDemo(prisma, quiet);
    const applications = await prisma.application.findMany({
      include: { applicant: true, castingRole: true },
    });

    for (const application of applications) {
      const { castingRole: role, applicant } = application;
      expect(applicant.role).toBe(role.seekingRole);
      expect(applicant.id).not.toBe(role.createdById);
      expect(role.status).not.toBe(CastingRoleStatus.DRAFT);
      expect(application.createdAt.getTime()).toBeGreaterThan(role.publishedAt!.getTime());
      if (role.closedAt) {
        expect(application.createdAt.getTime()).toBeLessThan(role.closedAt.getTime());
      }
    }

    // Every filed applicant applied to the folder's role.
    const entries = await prisma.shortlistEntry.findMany({
      include: { folder: true, application: true },
    });
    for (const entry of entries) {
      expect(entry.application.castingRoleId).toBe(entry.folder.castingRoleId);
    }
  });

  it('links media externally — Unsplash photos and verified Instagram reels — and uploads nothing', async () => {
    await seedDemo(prisma, quiet);
    const items = await prisma.portfolioItem.findMany();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.provider).toBe(StorageProvider.EXTERNAL);
      if (item.kind === PortfolioMediaKind.PHOTO) {
        expect(item.url).toMatch(/^https:\/\/images\.unsplash\.com\/photo-/);
      } else {
        expect(item.kind).toBe(PortfolioMediaKind.LINK);
        expect(item.url).toMatch(/^https:\/\/www\.instagram\.com\/reel\/[A-Za-z0-9_-]+\/$/);
        // Captioned with the real owner, never passed off as the demo member's work.
        expect(item.title).toMatch(/^Sample reel — @/);
      }
    }

    const photos = await prisma.profile.findMany({ where: { profileImage: { not: null } } });
    for (const profile of photos) {
      expect(profile.profileImageProvider).toBe(StorageProvider.EXTERNAL);
    }
  });

  it('produces accounts that sign in and see what the rules say they should', async () => {
    await seedDemo(prisma, { ...quiet, password: 'demo-pass-123' });
    const actor = demoLogins().find((login) => login.name === 'Arjun Menon')!;

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: actor.email, password: 'demo-pass-123' });
    expect(login.status).toBe(200);
    const token = login.body.data.accessToken as string;

    // Browse lists open, in-date roles only: no draft, no closed, no expired role.
    const browse = await request(app).get('/api/v1/casting?pageSize=50').set(bearer(token));
    const titles = browse.body.data.castingRoles.map((role: { title: string }) => role.title);
    expect(titles).toHaveLength(7);
    expect(titles).not.toContain('Lead — untitled feature (draft)');
    expect(titles).not.toContain('Second-unit camera — documentary');
    expect(titles).not.toContain('Gaffer — 30-day village schedule');

    // A producer sees their applicants and folders through the real endpoints.
    const producer = demoLogins().find((entry) => entry.name === 'Rhea Malhotra')!;
    const producerToken = (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: producer.email, password: 'demo-pass-123' })
    ).body.data.accessToken as string;
    const mine = await request(app).get('/api/v1/casting/mine').set(bearer(producerToken));
    const lead = mine.body.data.castingRoles.find((role: { title: string }) =>
      role.title.startsWith('Lead — Meera')
    );
    const applicants = await request(app)
      .get(`/api/v1/casting/${lead.id}/applications`)
      .set(bearer(producerToken));
    expect(applicants.body.data.pagination.total).toBe(5);
    const folders = await request(app)
      .get(`/api/v1/casting/${lead.id}/shortlists`)
      .set(bearer(producerToken));
    expect(
      folders.body.data.folders.map((folder: { name: string; applicantCount: number }) => [
        folder.name,
        folder.applicantCount,
      ])
    ).toEqual([
      ['Callbacks', 2],
      ['Strong maybe', 1],
    ]);
  });

  it('--fresh replaces only demo accounts and leaves real ones alone', async () => {
    const real = await registerUser(app, { role: Role.PRODUCER });
    await seedDemo(prisma, quiet);
    const before = await prisma.user.findMany({
      where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
      select: { id: true },
    });

    const again = await seedDemo(prisma, { ...quiet, fresh: true });
    expect(again.created).toBe(true);

    const after = await prisma.user.findMany({
      where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
      select: { id: true },
    });
    expect(after).toHaveLength(17);
    const beforeIds = new Set(before.map((user) => user.id));
    expect(after.filter((user) => beforeIds.has(user.id))).toHaveLength(0);
    expect(await prisma.user.findUnique({ where: { id: real.userId } })).not.toBeNull();
  });
});
