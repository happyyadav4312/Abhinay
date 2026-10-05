import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { LIMITS } from '../../src/validators/common';
import {
  applyTo,
  bearer,
  createCastingRole,
  disconnect,
  makeAdmin,
  registerUser,
  resetDatabase,
} from '../helpers';

beforeEach(resetDatabase);
afterAll(disconnect);

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

/** A published role, posted by a fresh producer, casting for `seekingRole`. */
async function openRole(seekingRole: Role = Role.ACTOR, title = 'Open role') {
  const producer = await registerUser(app, { role: Role.PRODUCER });
  const role = await createCastingRole(
    app,
    producer.accessToken,
    { seekingRole, title },
    { publish: true }
  );
  return { producer, role };
}

function closeRole(token: string, id: string) {
  return request(app)
    .patch(`/api/v1/casting/${id}/status`)
    .set(bearer(token))
    .send({ status: 'CLOSED' });
}

describe('POST /api/v1/casting/:id/applications', () => {
  it('lets a member whose profession matches apply, starting as APPLIED', async () => {
    const { producer, role } = await openRole(Role.ACTOR);
    const actor = await registerUser(app, { name: 'Asha Actor', role: Role.ACTOR });

    const res = await applyTo(app, actor.accessToken, role.id);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Application submitted');
    expect(res.body.data.application).toMatchObject({
      status: 'APPLIED',
      castingRole: { id: role.id, title: role.title, status: 'OPEN' },
    });

    // The applicant sees their own application on the role page...
    const asApplicant = await request(app)
      .get(`/api/v1/casting/${role.id}`)
      .set(bearer(actor.accessToken));
    expect(asApplicant.body.data.castingRole.myApplication).toMatchObject({
      id: res.body.data.application.id,
      status: 'APPLIED',
    });
    expect(asApplicant.body.data.castingRole.applicationCount).toBeNull();

    // ...and the author sees how many have applied, not who.
    const asAuthor = await request(app)
      .get(`/api/v1/casting/${role.id}`)
      .set(bearer(producer.accessToken));
    expect(asAuthor.body.data.castingRole).toMatchObject({
      applicationCount: 1,
      myApplication: null,
    });
    const serialized = JSON.stringify(asAuthor.body);
    expect(serialized).not.toContain(actor.email);
    expect(serialized).not.toContain(actor.userId);
  });

  it('works for every profession, including a director applying to a director role', async () => {
    for (const profession of [
      Role.DIRECTOR,
      Role.PRODUCER,
      Role.CAMERA_OPERATOR,
      Role.EDITOR,
      Role.OTHER_CREW,
    ]) {
      const { role } = await openRole(profession);
      const applicant = await registerUser(app, { role: profession });
      expect((await applyTo(app, applicant.accessToken, role.id)).status).toBe(201);
    }
    expect(await prisma.application.count()).toBe(5);
  });

  it('refuses a profession that does not match with 403 NOT_ELIGIBLE', async () => {
    const { role } = await openRole(Role.ACTOR);

    for (const profession of [Role.EDITOR, Role.CAMERA_OPERATOR, Role.DIRECTOR]) {
      const member = await registerUser(app, { role: profession });
      const res = await applyTo(app, member.accessToken, role.id);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_ELIGIBLE');
      expect(res.body.error.message).toBe('Only actor profiles can apply to this role');
    }

    // ADMIN is never a casting target, so never eligible.
    const admin = await registerUser(app);
    await makeAdmin(admin.userId);
    expect((await applyTo(app, admin.accessToken, role.id)).status).toBe(403);

    expect(await prisma.application.count()).toBe(0);
  });

  it('judges eligibility by the current profession, not the one in the token', async () => {
    const { role } = await openRole(Role.ACTOR);
    const member = await registerUser(app, { role: Role.EDITOR });

    expect((await applyTo(app, member.accessToken, role.id)).status).toBe(403);

    await prisma.user.update({ where: { id: member.userId }, data: { role: Role.ACTOR } });
    expect((await applyTo(app, member.accessToken, role.id)).status).toBe(201);
  });

  it('refuses the author with 403, even when the profession matches', async () => {
    const director = await registerUser(app, { role: Role.DIRECTOR });
    const role = await createCastingRole(
      app,
      director.accessToken,
      { seekingRole: Role.DIRECTOR },
      { publish: true }
    );

    const res = await applyTo(app, director.accessToken, role.id);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ELIGIBLE');
    expect(await prisma.application.count()).toBe(0);
  });

  it('hides drafts with 404 and refuses closed roles with 409', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const actor = await registerUser(app, { role: Role.ACTOR });

    const draft = await createCastingRole(app, producer.accessToken);
    const draftRes = await applyTo(app, actor.accessToken, draft.id);
    expect(draftRes.status).toBe(404);
    expect(draftRes.body.error.code).toBe('NOT_FOUND');

    const closed = await createCastingRole(app, producer.accessToken, {}, { publish: true });
    await closeRole(producer.accessToken, closed.id);
    const closedRes = await applyTo(app, actor.accessToken, closed.id);
    expect(closedRes.status).toBe(409);
    expect(closedRes.body.error.code).toBe('CASTING_ROLE_NOT_OPEN');

    expect(await prisma.application.count()).toBe(0);
  });

  it('allows one application per member, even under concurrent attempts', async () => {
    const { role } = await openRole(Role.ACTOR);
    const actor = await registerUser(app, { role: Role.ACTOR });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => applyTo(app, actor.accessToken, role.id))
    );

    expect(results.map((res) => res.status).sort()).toEqual([201, 409, 409, 409, 409]);
    for (const res of results.filter((r) => r.status === 409)) {
      expect(res.body.error.code).toBe('ALREADY_APPLIED');
    }
    expect(await prisma.application.count()).toBe(1);

    const again = await applyTo(app, actor.accessToken, role.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_APPLIED');
  });

  it('rejects a body (422), unknown or malformed ids (404), no token (401) and an untrusted origin (403)', async () => {
    const { role } = await openRole(Role.ACTOR);
    const actor = await registerUser(app, { role: Role.ACTOR });

    const withBody = await request(app)
      .post(`/api/v1/casting/${role.id}/applications`)
      .set(bearer(actor.accessToken))
      .send({ applicantId: actor.userId, status: 'SELECTED' });
    expect(withBody.status).toBe(422);

    expect((await applyTo(app, actor.accessToken, UNKNOWN_ID)).status).toBe(404);
    expect((await applyTo(app, actor.accessToken, 'not-a-uuid')).status).toBe(404);
    expect((await request(app).post(`/api/v1/casting/${role.id}/applications`)).status).toBe(401);

    const evil = await applyTo(app, actor.accessToken, role.id).set(
      'Origin',
      'http://evil.example'
    );
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe('FORBIDDEN_ORIGIN');

    expect(await prisma.application.count()).toBe(0);
  });
});

describe('GET /api/v1/applications/mine', () => {
  it("lists only the caller's applications, newest first, each with its role", async () => {
    const { role: first } = await openRole(Role.ACTOR, 'First role');
    const { role: second } = await openRole(Role.ACTOR, 'Second role');
    const { role: others } = await openRole(Role.ACTOR, 'Someone else applied here');
    const asha = await registerUser(app, { role: Role.ACTOR });
    const ravi = await registerUser(app, { role: Role.ACTOR });

    const firstApplication = await applyTo(app, asha.accessToken, first.id);
    const secondApplication = await applyTo(app, asha.accessToken, second.id);
    await applyTo(app, ravi.accessToken, others.id);

    // Pin the times so "newest first" does not depend on clock resolution.
    await prisma.application.update({
      where: { id: firstApplication.body.data.application.id },
      data: { createdAt: new Date('2026-09-01T10:00:00.000Z') },
    });
    await prisma.application.update({
      where: { id: secondApplication.body.data.application.id },
      data: { createdAt: new Date('2026-09-02T10:00:00.000Z') },
    });

    const res = await request(app).get('/api/v1/applications/mine').set(bearer(asha.accessToken));

    expect(res.status).toBe(200);
    const titles = res.body.data.applications.map(
      (application: { castingRole: { title: string } }) => application.castingRole.title
    );
    expect(titles).toEqual(['Second role', 'First role']);
    expect(res.body.data.applications[0]).toMatchObject({
      status: 'APPLIED',
      createdAt: '2026-09-02T10:00:00.000Z',
      castingRole: { seekingRole: Role.ACTOR, status: 'OPEN' },
    });
    expect(res.body.data.applications[0].castingRole).toHaveProperty('postedBy');
    expect(res.body.data.pagination).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
  });

  it('keeps applications to roles that later close', async () => {
    const { producer, role } = await openRole(Role.ACTOR);
    const actor = await registerUser(app, { role: Role.ACTOR });
    await applyTo(app, actor.accessToken, role.id);
    await closeRole(producer.accessToken, role.id);

    const res = await request(app).get('/api/v1/applications/mine').set(bearer(actor.accessToken));
    expect(res.body.data.applications).toHaveLength(1);
    expect(res.body.data.applications[0].castingRole.status).toBe('CLOSED');

    const asAuthor = await request(app)
      .get(`/api/v1/casting/${role.id}`)
      .set(bearer(producer.accessToken));
    expect(asAuthor.body.data.castingRole.applicationCount).toBe(1);
  });

  it('filters by status and pages through results', async () => {
    const actor = await registerUser(app, { role: Role.ACTOR });
    const ids: string[] = [];
    for (const title of ['A', 'B', 'C']) {
      const { role } = await openRole(Role.ACTOR, `Role ${title}`);
      ids.push((await applyTo(app, actor.accessToken, role.id)).body.data.application.id);
    }
    // Moving statuses is WBS 1.3; set one directly to exercise the filter.
    await prisma.application.update({ where: { id: ids[0] }, data: { status: 'SELECTED' } });

    const mine = (query: Record<string, string>) =>
      request(app).get('/api/v1/applications/mine').query(query).set(bearer(actor.accessToken));

    expect((await mine({ status: 'APPLIED' })).body.data.pagination.total).toBe(2);
    expect((await mine({ status: 'SELECTED' })).body.data.applications[0].id).toBe(ids[0]);
    expect((await mine({ status: 'REJECTED' })).body.data.applications).toEqual([]);

    const secondPage = await mine({ page: '2', pageSize: '2' });
    expect(secondPage.body.data.applications).toHaveLength(1);
    expect(secondPage.body.data.pagination).toEqual({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
  });

  it('validates its query with 422 and requires authentication', async () => {
    const actor = await registerUser(app, { role: Role.ACTOR });
    const mine = (query: string) =>
      request(app).get(`/api/v1/applications/mine?${query}`).set(bearer(actor.accessToken));

    expect((await mine('status=WITHDRAWN')).status).toBe(422);
    expect((await mine(`pageSize=${LIMITS.PAGE_SIZE_MAX + 1}`)).status).toBe(422);
    expect((await mine('castingRoleId=x')).status).toBe(422);
    expect((await request(app).get('/api/v1/applications/mine')).status).toBe(401);
  });
});
