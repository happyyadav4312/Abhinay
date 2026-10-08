import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { env } from '../../src/config/env';
import { LIMITS } from '../../src/validators/common';
import {
  bearer,
  CASTING_ROLE_INPUT,
  CastingRoleBody,
  createCastingRole,
  disconnect,
  makeAdmin,
  registerUser,
  resetDatabase,
} from '../helpers';

beforeEach(resetDatabase);
afterAll(disconnect);

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

function titlesOf(res: request.Response): string[] {
  return res.body.data.castingRoles.map((role: CastingRoleBody) => role.title);
}

function setStatus(token: string, id: string, status: string) {
  return request(app).patch(`/api/v1/casting/${id}/status`).set(bearer(token)).send({ status });
}

describe('POST /api/v1/casting', () => {
  it('lets producers and directors create a draft attributed to their public profile', async () => {
    for (const role of [Role.PRODUCER, Role.DIRECTOR]) {
      const poster = await registerUser(app, { name: `Poster ${role}`, role });

      const res = await request(app)
        .post('/api/v1/casting')
        .set(bearer(poster.accessToken))
        .send(CASTING_ROLE_INPUT);

      expect(res.status).toBe(201);
      expect(res.body.data.castingRole).toMatchObject({
        ...CASTING_ROLE_INPUT,
        status: 'DRAFT',
        publishedAt: null,
        closedAt: null,
        isOwner: true,
        postedBy: { profileId: poster.profileId, name: `Poster ${role}`, role, photoUrl: null },
      });
    }

    expect(await prisma.castingRole.count()).toBe(2);
  });

  it('refuses every other role with 403 and anonymous callers with 401', async () => {
    for (const role of [Role.ACTOR, Role.CAMERA_OPERATOR, Role.EDITOR, Role.OTHER_CREW]) {
      const user = await registerUser(app, { role });
      const res = await request(app)
        .post('/api/v1/casting')
        .set(bearer(user.accessToken))
        .send(CASTING_ROLE_INPUT);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }

    // Moderation is a later work package; an admin is not a casting poster.
    const admin = await registerUser(app);
    await makeAdmin(admin.userId);
    expect(
      (
        await request(app)
          .post('/api/v1/casting')
          .set(bearer(admin.accessToken))
          .send(CASTING_ROLE_INPUT)
      ).status
    ).toBe(403);

    const anonymous = await request(app).post('/api/v1/casting').send(CASTING_ROLE_INPUT);
    expect(anonymous.status).toBe(401);

    expect(await prisma.castingRole.count()).toBe(0);
  });

  it('validates every field and rejects server-managed keys with 422', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const post = (body: object) =>
      request(app).post('/api/v1/casting').set(bearer(producer.accessToken)).send(body);

    const empty = await post({});
    expect(empty.status).toBe(422);
    expect(empty.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(empty.body.error.fieldErrors).sort()).toEqual([
      'compensation',
      'description',
      'location',
      'requirements',
      'seekingRole',
      'title',
    ]);

    const blank = await post({ ...CASTING_ROLE_INPUT, title: '   ', location: '' });
    expect(blank.status).toBe(422);
    expect(blank.body.error.fieldErrors).toHaveProperty('title');
    expect(blank.body.error.fieldErrors).toHaveProperty('location');

    const tooLong = await post({
      ...CASTING_ROLE_INPUT,
      description: 'x'.repeat(LIMITS.CASTING_DESCRIPTION_MAX + 1),
    });
    expect(tooLong.status).toBe(422);
    expect(tooLong.body.error.fieldErrors).toHaveProperty('description');

    expect((await post({ ...CASTING_ROLE_INPUT, seekingRole: Role.ADMIN })).status).toBe(422);
    expect((await post({ ...CASTING_ROLE_INPUT, seekingRole: 'STUNT_DOUBLE' })).status).toBe(422);

    for (const injected of [
      { status: 'OPEN' },
      { createdById: producer.userId },
      { publishedAt: new Date().toISOString() },
      { id: UNKNOWN_ID },
    ]) {
      expect((await post({ ...CASTING_ROLE_INPUT, ...injected })).status).toBe(422);
    }

    const malformed = await request(app)
      .post('/api/v1/casting')
      .set(bearer(producer.accessToken))
      .set('Content-Type', 'application/json')
      .send('{"title":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('BAD_REQUEST');

    expect(await prisma.castingRole.count()).toBe(0);
  });

  it('stores trimmed text', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const role = await createCastingRole(app, producer.accessToken, {
      title: '   Second unit DOP   ',
      location: '  Hyderabad ',
    });
    expect(role).toMatchObject({ title: 'Second unit DOP', location: 'Hyderabad' });
  });

  it('rejects a write from an untrusted browser origin', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });

    const res = await request(app)
      .post('/api/v1/casting')
      .set(bearer(producer.accessToken))
      .set('Origin', 'http://evil.example')
      .send(CASTING_ROLE_INPUT);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ORIGIN');
    expect(await prisma.castingRole.count()).toBe(0);
  });
});

describe('GET /api/v1/casting (browse)', () => {
  it('lists only open roles, newest first, with pagination and short previews', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const actor = await registerUser(app, { role: Role.ACTOR });

    await createCastingRole(app, producer.accessToken, { title: 'Unpublished draft' });
    const closed = await createCastingRole(
      app,
      producer.accessToken,
      { title: 'Already closed' },
      { publish: true }
    );
    await setStatus(producer.accessToken, closed.id, 'CLOSED');

    // Pin publication times so "newest first" does not depend on clock resolution.
    const titles = ['Oldest open role', 'Middle open role', 'Newest open role'];
    for (const [index, title] of titles.entries()) {
      const role = await createCastingRole(app, producer.accessToken, { title }, { publish: true });
      await prisma.castingRole.update({
        where: { id: role.id },
        data: { publishedAt: new Date(Date.UTC(2026, 8, 1 + index)) },
      });
    }

    const res = await request(app).get('/api/v1/casting').set(bearer(actor.accessToken));
    expect(res.status).toBe(200);
    expect(titlesOf(res)).toEqual(['Newest open role', 'Middle open role', 'Oldest open role']);
    expect(res.body.data.pagination).toEqual({ page: 1, pageSize: 20, total: 3, totalPages: 1 });

    const summary = res.body.data.castingRoles[0];
    expect(summary).toMatchObject({ status: 'OPEN', seekingRole: Role.ACTOR });
    expect(summary.descriptionPreview).toBe(CASTING_ROLE_INPUT.description);
    expect(summary).not.toHaveProperty('description');
    expect(summary).not.toHaveProperty('requirements');

    const secondPage = await request(app)
      .get('/api/v1/casting')
      .query({ page: 2, pageSize: 2 })
      .set(bearer(actor.accessToken));
    expect(titlesOf(secondPage)).toEqual(['Oldest open role']);
    expect(secondPage.body.data.pagination).toEqual({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });

    const pastTheEnd = await request(app)
      .get('/api/v1/casting')
      .query({ page: 9 })
      .set(bearer(actor.accessToken));
    expect(pastTheEnd.status).toBe(200);
    expect(titlesOf(pastTheEnd)).toEqual([]);
  });

  it('cuts long descriptions into a preview', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    await createCastingRole(
      app,
      producer.accessToken,
      { description: `${'word '.repeat(100)}\n\nend` },
      { publish: true }
    );

    const res = await request(app).get('/api/v1/casting').set(bearer(producer.accessToken));
    const preview: string = res.body.data.castingRoles[0].descriptionPreview;
    expect(preview.length).toBeLessThanOrEqual(200);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview).not.toContain('\n');
  });

  it('searches title, description, requirements and location, ignoring case', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const viewer = await registerUser(app, { role: Role.EDITOR });

    await createCastingRole(
      app,
      producer.accessToken,
      {
        title: 'Gaffer for a night shoot',
        description: 'Lead the lighting crew.',
        requirements: 'Own vehicle.',
        location: 'Mumbai',
        seekingRole: Role.OTHER_CREW,
      },
      { publish: true }
    );
    await createCastingRole(
      app,
      producer.accessToken,
      {
        title: 'Lead actor',
        description: 'A MONSOON romance.',
        requirements: 'Fluent Marathi.',
        location: 'Pune',
      },
      { publish: true }
    );

    const search = async (q: string) =>
      titlesOf(
        await request(app).get('/api/v1/casting').query({ q }).set(bearer(viewer.accessToken))
      );

    expect(await search('GAFFER')).toEqual(['Gaffer for a night shoot']);
    expect(await search('monsoon')).toEqual(['Lead actor']);
    expect(await search('marathi')).toEqual(['Lead actor']);
    expect(await search('mumbai')).toEqual(['Gaffer for a night shoot']);
    expect(await search('no such production')).toEqual([]);
  });

  it('treats % and _ in the search text literally', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    await createCastingRole(
      app,
      producer.accessToken,
      { title: 'Fully committed', requirements: 'Must be 100% available.' },
      { publish: true }
    );
    await createCastingRole(
      app,
      producer.accessToken,
      { title: 'Day rate', requirements: 'Budget of 1000 per day.' },
      { publish: true }
    );
    await createCastingRole(app, producer.accessToken, { title: 'Role_A' }, { publish: true });
    await createCastingRole(app, producer.accessToken, { title: 'RoleXA' }, { publish: true });
    await createCastingRole(app, producer.accessToken, { title: 'Back\\slash' }, { publish: true });

    const search = async (q: string) =>
      titlesOf(
        await request(app).get('/api/v1/casting').query({ q }).set(bearer(producer.accessToken))
      );

    expect(await search('100%')).toEqual(['Fully committed']);
    expect(await search('role_a')).toEqual(['Role_A']);
    expect(await search('k\\s')).toEqual(['Back\\slash']);
  });

  it('filters by seeking role and location, and ignores cleared filters', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const viewer = await registerUser(app, { role: Role.ACTOR });

    await createCastingRole(
      app,
      producer.accessToken,
      { title: 'Actor in Kochi', location: 'Kochi, Kerala' },
      { publish: true }
    );
    await createCastingRole(
      app,
      producer.accessToken,
      { title: 'Actor in Mumbai', location: 'Mumbai' },
      { publish: true }
    );
    await createCastingRole(
      app,
      producer.accessToken,
      { title: 'Camera in Kochi', location: 'kochi', seekingRole: Role.CAMERA_OPERATOR },
      { publish: true }
    );

    const browse = async (query: Record<string, string>) =>
      titlesOf(
        await request(app).get('/api/v1/casting').query(query).set(bearer(viewer.accessToken))
      )
        .slice()
        .sort();

    expect(await browse({ seekingRole: Role.ACTOR })).toEqual([
      'Actor in Kochi',
      'Actor in Mumbai',
    ]);
    expect(await browse({ location: 'KOCHI' })).toEqual(['Actor in Kochi', 'Camera in Kochi']);
    expect(await browse({ seekingRole: Role.CAMERA_OPERATOR, location: 'kochi' })).toEqual([
      'Camera in Kochi',
    ]);
    expect(await browse({ q: '', seekingRole: '', location: '' })).toHaveLength(3);
  });

  it('validates query parameters with 422 and requires authentication', async () => {
    const viewer = await registerUser(app, { role: Role.ACTOR });
    const browse = (query: string) =>
      request(app).get(`/api/v1/casting?${query}`).set(bearer(viewer.accessToken));

    expect((await browse(`pageSize=${LIMITS.PAGE_SIZE_MAX + 1}`)).status).toBe(422);
    expect((await browse('page=0')).status).toBe(422);
    expect((await browse('seekingRole=ADMIN')).status).toBe(422);
    expect((await browse('sort=popular')).status).toBe(422);
    expect((await browse('status=DRAFT')).status).toBe(422);
    expect((await browse('q=a&q=b')).status).toBe(422);
    expect((await browse(`q=${'x'.repeat(LIMITS.CASTING_SEARCH_MAX + 1)}`)).status).toBe(422);

    const anonymous = await request(app).get('/api/v1/casting');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('GET /api/v1/casting/mine', () => {
  it("returns only the caller's roles, in every status, filterable by status", async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const rival = await registerUser(app, { role: Role.DIRECTOR });

    await createCastingRole(app, producer.accessToken, { title: 'My draft' });
    await createCastingRole(
      app,
      producer.accessToken,
      { title: 'My open role' },
      { publish: true }
    );
    const toClose = await createCastingRole(
      app,
      producer.accessToken,
      { title: 'My closed role' },
      { publish: true }
    );
    await setStatus(producer.accessToken, toClose.id, 'CLOSED');
    await createCastingRole(app, rival.accessToken, { title: 'Rival role' }, { publish: true });

    const mine = await request(app).get('/api/v1/casting/mine').set(bearer(producer.accessToken));
    expect(mine.status).toBe(200);
    expect(titlesOf(mine).sort()).toEqual(['My closed role', 'My draft', 'My open role']);
    expect(mine.body.data.pagination.total).toBe(3);

    const drafts = await request(app)
      .get('/api/v1/casting/mine')
      .query({ status: 'DRAFT' })
      .set(bearer(producer.accessToken));
    expect(titlesOf(drafts)).toEqual(['My draft']);

    expect(
      (
        await request(app)
          .get('/api/v1/casting/mine')
          .query({ status: 'ARCHIVED' })
          .set(bearer(producer.accessToken))
      ).status
    ).toBe(422);
  });

  it('is not captured by /:id and is forbidden to non-posters', async () => {
    const actor = await registerUser(app, { role: Role.ACTOR });

    // A 404 here would mean `/:id` swallowed the literal segment.
    const denied = await request(app).get('/api/v1/casting/mine').set(bearer(actor.accessToken));
    expect(denied.status).toBe(403);

    expect((await request(app).get('/api/v1/casting/mine')).status).toBe(401);
  });
});

describe('GET /api/v1/casting/:id', () => {
  it('shows open and closed roles to any signed-in user, with ownership per viewer', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const actor = await registerUser(app, { role: Role.ACTOR });
    const role = await createCastingRole(app, producer.accessToken, {}, { publish: true });

    const asActor = await request(app)
      .get(`/api/v1/casting/${role.id}`)
      .set(bearer(actor.accessToken));
    expect(asActor.status).toBe(200);
    expect(asActor.body.data.castingRole).toMatchObject({
      description: CASTING_ROLE_INPUT.description,
      requirements: CASTING_ROLE_INPUT.requirements,
      status: 'OPEN',
      isOwner: false,
    });

    const asOwner = await request(app)
      .get(`/api/v1/casting/${role.id}`)
      .set(bearer(producer.accessToken));
    expect(asOwner.body.data.castingRole.isOwner).toBe(true);

    await setStatus(producer.accessToken, role.id, 'CLOSED');
    const closed = await request(app)
      .get(`/api/v1/casting/${role.id}`)
      .set(bearer(actor.accessToken));
    expect(closed.status).toBe(200);
    expect(closed.body.data.castingRole.status).toBe('CLOSED');
    expect(closed.body.data.castingRole.closedAt).not.toBeNull();
  });

  it('hides a draft from everyone except its author', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const rival = await registerUser(app, { role: Role.PRODUCER });
    const actor = await registerUser(app, { role: Role.ACTOR });
    const draft = await createCastingRole(app, producer.accessToken);

    for (const outsider of [rival, actor]) {
      const res = await request(app)
        .get(`/api/v1/casting/${draft.id}`)
        .set(bearer(outsider.accessToken));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }

    const asAuthor = await request(app)
      .get(`/api/v1/casting/${draft.id}`)
      .set(bearer(producer.accessToken));
    expect(asAuthor.status).toBe(200);
  });

  it('answers 404 for unknown and malformed ids, and 401 without a token', async () => {
    const actor = await registerUser(app, { role: Role.ACTOR });

    expect(
      (await request(app).get(`/api/v1/casting/${UNKNOWN_ID}`).set(bearer(actor.accessToken)))
        .status
    ).toBe(404);
    expect(
      (await request(app).get('/api/v1/casting/not-a-uuid').set(bearer(actor.accessToken))).status
    ).toBe(404);
    expect((await request(app).get(`/api/v1/casting/${UNKNOWN_ID}`)).status).toBe(401);
  });
});

describe('PUT /api/v1/casting/:id', () => {
  const edited = { ...CASTING_ROLE_INPUT, title: 'Lead — Meera (revised)', location: 'Kozhikode' };

  it('lets the owner edit a draft and an open role without changing its status', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });

    const draft = await createCastingRole(app, producer.accessToken);
    // Backdate the row so the assertion below proves updatedAt really moved.
    const longAgo = new Date('2026-01-01T00:00:00.000Z');
    await prisma.castingRole.update({ where: { id: draft.id }, data: { updatedAt: longAgo } });

    const draftEdit = await request(app)
      .put(`/api/v1/casting/${draft.id}`)
      .set(bearer(producer.accessToken))
      .send(edited);
    expect(draftEdit.status).toBe(200);
    expect(draftEdit.body.data.castingRole).toMatchObject({
      title: edited.title,
      location: 'Kozhikode',
      status: 'DRAFT',
    });
    expect(new Date(draftEdit.body.data.castingRole.updatedAt).getTime()).toBeGreaterThan(
      longAgo.getTime()
    );

    const open = await createCastingRole(app, producer.accessToken, {}, { publish: true });
    const openEdit = await request(app)
      .put(`/api/v1/casting/${open.id}`)
      .set(bearer(producer.accessToken))
      .send(edited);
    expect(openEdit.status).toBe(200);
    expect(openEdit.body.data.castingRole).toMatchObject({
      title: edited.title,
      status: 'OPEN',
      publishedAt: open.publishedAt,
    });
  });

  it('refuses to edit a closed role with 409 and leaves it untouched', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const role = await createCastingRole(app, producer.accessToken, {}, { publish: true });
    await setStatus(producer.accessToken, role.id, 'CLOSED');

    const res = await request(app)
      .put(`/api/v1/casting/${role.id}`)
      .set(bearer(producer.accessToken))
      .send(edited);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CASTING_ROLE_CLOSED');
    const row = await prisma.castingRole.findUniqueOrThrow({ where: { id: role.id } });
    expect(row.title).toBe(CASTING_ROLE_INPUT.title);
  });

  it('gives another producer 404 and a non-poster 403, changing nothing', async () => {
    const owner = await registerUser(app, { role: Role.PRODUCER });
    const rival = await registerUser(app, { role: Role.DIRECTOR });
    const actor = await registerUser(app, { role: Role.ACTOR });
    const role = await createCastingRole(app, owner.accessToken, {}, { publish: true });

    const hijack = await request(app)
      .put(`/api/v1/casting/${role.id}`)
      .set(bearer(rival.accessToken))
      .send({ ...edited, title: 'Hijacked' });
    expect(hijack.status).toBe(404);

    const notAPoster = await request(app)
      .put(`/api/v1/casting/${role.id}`)
      .set(bearer(actor.accessToken))
      .send({ ...edited, title: 'Hijacked' });
    expect(notAPoster.status).toBe(403);

    expect((await request(app).put(`/api/v1/casting/${role.id}`).send(edited)).status).toBe(401);

    const row = await prisma.castingRole.findUniqueOrThrow({ where: { id: role.id } });
    expect(row.title).toBe(CASTING_ROLE_INPUT.title);
  });

  it('rejects injected status and ownership fields with 422', async () => {
    const owner = await registerUser(app, { role: Role.PRODUCER });
    const rival = await registerUser(app, { role: Role.PRODUCER });
    const role = await createCastingRole(app, owner.accessToken);

    for (const injected of [{ status: 'OPEN' }, { createdById: rival.userId }]) {
      const res = await request(app)
        .put(`/api/v1/casting/${role.id}`)
        .set(bearer(owner.accessToken))
        .send({ ...edited, ...injected });
      expect(res.status).toBe(422);
    }

    const row = await prisma.castingRole.findUniqueOrThrow({ where: { id: role.id } });
    expect(row).toMatchObject({ status: 'DRAFT', createdById: owner.userId });
  });
});

describe('PATCH /api/v1/casting/:id/status', () => {
  it('publishes a draft and closes an open role, stamping each moment', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const role = await createCastingRole(app, producer.accessToken);

    const published = await setStatus(producer.accessToken, role.id, 'OPEN');
    expect(published.status).toBe(200);
    expect(published.body.message).toBe('Casting role published');
    expect(published.body.data.castingRole).toMatchObject({ status: 'OPEN', closedAt: null });
    expect(published.body.data.castingRole.publishedAt).not.toBeNull();

    const closed = await setStatus(producer.accessToken, role.id, 'CLOSED');
    expect(closed.status).toBe(200);
    expect(closed.body.data.castingRole).toMatchObject({
      status: 'CLOSED',
      publishedAt: published.body.data.castingRole.publishedAt,
    });
    expect(closed.body.data.castingRole.closedAt).not.toBeNull();
  });

  it('is idempotent when the role already has the requested status', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const role = await createCastingRole(app, producer.accessToken, {}, { publish: true });

    const again = await setStatus(producer.accessToken, role.id, 'OPEN');
    expect(again.status).toBe(200);
    expect(again.body.data.castingRole.publishedAt).toBe(role.publishedAt);
  });

  it('refuses to close a draft or reopen a closed role with 409', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });

    const draft = await createCastingRole(app, producer.accessToken);
    const closeDraft = await setStatus(producer.accessToken, draft.id, 'CLOSED');
    expect(closeDraft.status).toBe(409);
    expect(closeDraft.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    const role = await createCastingRole(app, producer.accessToken, {}, { publish: true });
    await setStatus(producer.accessToken, role.id, 'CLOSED');
    const reopen = await setStatus(producer.accessToken, role.id, 'OPEN');
    expect(reopen.status).toBe(409);
    expect(reopen.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    expect((await prisma.castingRole.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe(
      'DRAFT'
    );
    expect((await prisma.castingRole.findUniqueOrThrow({ where: { id: role.id } })).status).toBe(
      'CLOSED'
    );
  });

  it('rejects DRAFT as a target and unknown keys with 422', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const role = await createCastingRole(app, producer.accessToken, {}, { publish: true });

    expect((await setStatus(producer.accessToken, role.id, 'DRAFT')).status).toBe(422);
    const extra = await request(app)
      .patch(`/api/v1/casting/${role.id}/status`)
      .set(bearer(producer.accessToken))
      .send({ status: 'CLOSED', closedAt: '2020-01-01T00:00:00.000Z' });
    expect(extra.status).toBe(422);
  });

  it('performs a concurrent publish exactly once', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const role = await createCastingRole(app, producer.accessToken);

    const results = await Promise.all(
      Array.from({ length: 6 }, () => setStatus(producer.accessToken, role.id, 'OPEN'))
    );

    expect(results.map((res) => res.status)).toEqual([200, 200, 200, 200, 200, 200]);
    const stamps = new Set(results.map((res) => res.body.data.castingRole.publishedAt));
    expect(stamps.size).toBe(1);

    const row = await prisma.castingRole.findUniqueOrThrow({ where: { id: role.id } });
    expect(row.publishedAt?.toISOString()).toBe([...stamps][0]);
  });

  it('is owner-only: another producer gets 404, a non-poster 403', async () => {
    const owner = await registerUser(app, { role: Role.PRODUCER });
    const rival = await registerUser(app, { role: Role.PRODUCER });
    const actor = await registerUser(app, { role: Role.ACTOR });
    const role = await createCastingRole(app, owner.accessToken);

    expect((await setStatus(rival.accessToken, role.id, 'OPEN')).status).toBe(404);
    expect((await setStatus(actor.accessToken, role.id, 'OPEN')).status).toBe(403);
    expect((await setStatus(owner.accessToken, UNKNOWN_ID, 'OPEN')).status).toBe(404);

    expect((await prisma.castingRole.findUniqueOrThrow({ where: { id: role.id } })).status).toBe(
      'DRAFT'
    );
  });
});

describe('DELETE /api/v1/casting/:id', () => {
  it('deletes a draft with 204 and no body', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const draft = await createCastingRole(app, producer.accessToken);

    const res = await request(app)
      .delete(`/api/v1/casting/${draft.id}`)
      .set(bearer(producer.accessToken));

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(await prisma.castingRole.count()).toBe(0);
    expect(
      (await request(app).get(`/api/v1/casting/${draft.id}`).set(bearer(producer.accessToken)))
        .status
    ).toBe(404);
  });

  it('refuses to delete a published or closed role with 409', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const open = await createCastingRole(app, producer.accessToken, {}, { publish: true });
    const closed = await createCastingRole(app, producer.accessToken, {}, { publish: true });
    await setStatus(producer.accessToken, closed.id, 'CLOSED');

    for (const role of [open, closed]) {
      const res = await request(app)
        .delete(`/api/v1/casting/${role.id}`)
        .set(bearer(producer.accessToken));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CASTING_ROLE_NOT_DRAFT');
    }

    expect(await prisma.castingRole.count()).toBe(2);
  });

  it('gives another producer 404 and keeps the draft', async () => {
    const owner = await registerUser(app, { role: Role.PRODUCER });
    const rival = await registerUser(app, { role: Role.PRODUCER });
    const draft = await createCastingRole(app, owner.accessToken);

    const res = await request(app)
      .delete(`/api/v1/casting/${draft.id}`)
      .set(bearer(rival.accessToken));

    expect(res.status).toBe(404);
    expect(await prisma.castingRole.count()).toBe(1);
  });
});

describe('Casting CORS and privacy', () => {
  it('allows PATCH in the preflight for the configured frontend origin', async () => {
    const res = await request(app)
      .options(`/api/v1/casting/${UNKNOWN_ID}/status`)
      .set('Origin', env.FRONTEND_URL)
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(res.headers['access-control-allow-origin']).toBe(env.FRONTEND_URL);
    expect(res.headers['access-control-allow-methods']).toContain('PATCH');
  });

  it("never exposes the poster's email, phone or user id", async () => {
    const producer = await registerUser(app, { name: 'Private Producer', role: Role.PRODUCER });
    await request(app).put('/api/v1/profile/me').set(bearer(producer.accessToken)).send({
      name: 'Private Producer',
      bio: null,
      location: null,
      phone: '+91 90000 22222',
    });
    const role = await createCastingRole(app, producer.accessToken, {}, { publish: true });
    const viewer = await registerUser(app, { role: Role.ACTOR });

    const list = await request(app).get('/api/v1/casting').set(bearer(viewer.accessToken));
    const detail = await request(app)
      .get(`/api/v1/casting/${role.id}`)
      .set(bearer(viewer.accessToken));

    for (const res of [list, detail]) {
      const serialized = JSON.stringify(res.body);
      expect(serialized).toContain('Private Producer');
      expect(serialized).not.toContain(producer.email);
      expect(serialized).not.toContain(producer.userId);
      expect(serialized).not.toContain('+91 90000 22222');
      expect(serialized).not.toContain('passwordHash');
    }
  });
});
