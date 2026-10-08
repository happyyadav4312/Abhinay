import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { LIMITS } from '../../src/validators/common';
import {
  applyTo,
  bearer,
  CASTING_ROLE_INPUT,
  createCastingRole,
  dateFromToday,
  disconnect,
  registerUser,
  resetDatabase,
} from '../helpers';

/** Move a role's deadline into the past directly — the API itself refuses to. */
async function backdateDeadline(roleId: string, daysAgo = 1): Promise<void> {
  await prisma.castingRole.update({
    where: { id: roleId },
    data: { applicationDeadline: new Date(`${dateFromToday(-daysAgo)}T00:00:00.000Z`) },
  });
}

beforeEach(resetDatabase);
afterAll(disconnect);

describe('setting a deadline', () => {
  it('stores and returns a calendar date, and reports whether applications are open', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const deadline = dateFromToday(14);

    const draft = await createCastingRole(app, producer.accessToken, {
      applicationDeadline: deadline,
    });
    expect(draft.applicationDeadline).toBe(deadline);
    expect(draft.acceptingApplications).toBe(false); // still a draft

    const published = await request(app)
      .patch(`/api/v1/casting/${draft.id}/status`)
      .set(bearer(producer.accessToken))
      .send({ status: 'OPEN' });
    expect(published.body.data.castingRole).toMatchObject({
      applicationDeadline: deadline,
      acceptingApplications: true,
    });
  });

  it('accepts today, and rejects yesterday or a date more than a year away', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const create = (applicationDeadline: string) =>
      request(app)
        .post('/api/v1/casting')
        .set(bearer(producer.accessToken))
        .send({ ...CASTING_ROLE_INPUT, applicationDeadline });

    expect((await create(dateFromToday(0))).status).toBe(201);
    expect((await create(dateFromToday(LIMITS.CASTING_DEADLINE_MAX_DAYS))).status).toBe(201);

    const past = await create(dateFromToday(-1));
    expect(past.status).toBe(422);
    expect(past.body.error.fieldErrors.applicationDeadline[0]).toMatch(/past/);

    const tooFar = await create(dateFromToday(LIMITS.CASTING_DEADLINE_MAX_DAYS + 1));
    expect(tooFar.status).toBe(422);

    const nonsense = await create('2026-02-30');
    expect(nonsense.status).toBe(422);
  });

  it('lets an edit keep a deadline that has since passed, but not set a new past one', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const role = await createCastingRole(
      app,
      producer.accessToken,
      { applicationDeadline: dateFromToday(5) },
      { publish: true }
    );
    await backdateDeadline(role.id, 2);
    const stored = dateFromToday(-2);

    const unchanged = await request(app)
      .put(`/api/v1/casting/${role.id}`)
      .set(bearer(producer.accessToken))
      .send({ ...CASTING_ROLE_INPUT, title: 'Edited title', applicationDeadline: stored });
    expect(unchanged.status).toBe(200);

    const newPast = await request(app)
      .put(`/api/v1/casting/${role.id}`)
      .set(bearer(producer.accessToken))
      .send({ ...CASTING_ROLE_INPUT, applicationDeadline: dateFromToday(-1) });
    expect(newPast.status).toBe(422);

    // Extending it reopens the role to applications.
    const extended = await request(app)
      .put(`/api/v1/casting/${role.id}`)
      .set(bearer(producer.accessToken))
      .send({ ...CASTING_ROLE_INPUT, applicationDeadline: dateFromToday(7) });
    expect(extended.status).toBe(200);
    expect(extended.body.data.castingRole.acceptingApplications).toBe(true);

    // Clearing it means "no deadline".
    const cleared = await request(app)
      .put(`/api/v1/casting/${role.id}`)
      .set(bearer(producer.accessToken))
      .send({ ...CASTING_ROLE_INPUT, applicationDeadline: null });
    expect(cleared.body.data.castingRole.applicationDeadline).toBeNull();
  });

  it('refuses to publish a draft whose deadline has already passed', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const draft = await createCastingRole(app, producer.accessToken, {
      applicationDeadline: dateFromToday(3),
    });
    await backdateDeadline(draft.id);

    const res = await request(app)
      .patch(`/api/v1/casting/${draft.id}/status`)
      .set(bearer(producer.accessToken))
      .send({ status: 'OPEN' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEADLINE_PASSED');

    const row = await prisma.castingRole.findUniqueOrThrow({ where: { id: draft.id } });
    expect(row.status).toBe('DRAFT');
  });
});

describe('after the deadline', () => {
  it('hides the role from browse, keeps it readable, and refuses applications', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const actor = await registerUser(app, { role: Role.ACTOR });
    const role = await createCastingRole(
      app,
      producer.accessToken,
      { applicationDeadline: dateFromToday(2) },
      { publish: true }
    );
    await backdateDeadline(role.id);

    const browse = await request(app).get('/api/v1/casting').set(bearer(actor.accessToken));
    expect(browse.body.data.castingRoles).toHaveLength(0);

    const detail = await request(app)
      .get(`/api/v1/casting/${role.id}`)
      .set(bearer(actor.accessToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.castingRole).toMatchObject({
      status: 'OPEN',
      acceptingApplications: false,
    });

    const apply = await applyTo(app, actor.accessToken, role.id);
    expect(apply.status).toBe(409);
    expect(apply.body.error.code).toBe('DEADLINE_PASSED');
    expect(await prisma.application.count()).toBe(0);
  });

  it('still accepts applications on the deadline day itself', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const actor = await registerUser(app, { role: Role.ACTOR });
    const role = await createCastingRole(
      app,
      producer.accessToken,
      { applicationDeadline: dateFromToday(0) },
      { publish: true }
    );

    expect((await applyTo(app, actor.accessToken, role.id)).status).toBe(201);
  });
});

describe('browse by deadline', () => {
  it('sorts soonest deadline first with no-deadline roles last, and filters by a cut-off', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const actor = await registerUser(app, { role: Role.ACTOR });
    const make = (title: string, applicationDeadline: string | null) =>
      createCastingRole(
        app,
        producer.accessToken,
        { title, applicationDeadline },
        { publish: true }
      );

    await make('No deadline', null);
    await make('In thirty days', dateFromToday(30));
    await make('In three days', dateFromToday(3));
    await make('In ten days', dateFromToday(10));

    const browse = (query: string) =>
      request(app).get(`/api/v1/casting${query}`).set(bearer(actor.accessToken));

    const byDeadline = await browse('?sort=deadline');
    expect(byDeadline.body.data.castingRoles.map((r: { title: string }) => r.title)).toEqual([
      'In three days',
      'In ten days',
      'In thirty days',
      'No deadline',
    ]);

    const oldest = await browse('?sort=oldest');
    expect(oldest.body.data.castingRoles[0].title).toBe('No deadline');

    const newest = await browse('');
    expect(newest.body.data.castingRoles[0].title).toBe('In ten days');

    const closingSoon = await browse(`?deadlineBefore=${dateFromToday(10)}&sort=deadline`);
    expect(closingSoon.body.data.castingRoles.map((r: { title: string }) => r.title)).toEqual([
      'In three days',
      'In ten days',
    ]);
    expect(closingSoon.body.data.pagination.total).toBe(2);

    expect((await browse('?sort=popular')).status).toBe(422);
    expect((await browse('?deadlineBefore=soon')).status).toBe(422);
  });

  it('matches compensation in free-text search', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    await createCastingRole(
      app,
      producer.accessToken,
      { compensation: 'Unpaid — credit and meals' },
      { publish: true }
    );
    await createCastingRole(app, producer.accessToken, {}, { publish: true });

    const res = await request(app).get('/api/v1/casting?q=meals').set(bearer(producer.accessToken));
    expect(res.body.data.castingRoles).toHaveLength(1);
  });
});
