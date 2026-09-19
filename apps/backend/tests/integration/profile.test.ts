import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { LIMITS } from '../../src/validators/common';
import { bearer, disconnect, registerUser, resetDatabase } from '../helpers';

beforeEach(resetDatabase);
afterAll(disconnect);

describe('GET /api/v1/profile/me', () => {
  it('returns the owner projection created at registration', async () => {
    const user = await registerUser(app, { name: 'Owner Person', role: Role.DIRECTOR });

    const res = await request(app).get('/api/v1/profile/me').set(bearer(user.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({
      id: user.profileId,
      userId: user.userId,
      name: 'Owner Person',
      email: user.email,
      role: Role.DIRECTOR,
      bio: null,
      location: null,
      phone: null,
      photoUrl: null,
      skills: [],
      experiences: [],
    });
  });

  it('is not captured by the public :id route when the token is missing', async () => {
    const res = await request(app).get('/api/v1/profile/me');

    // A 404 here would mean `/:id` swallowed the literal segment and turned an
    // authentication failure into an anonymous profile lookup.
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('PUT /api/v1/profile/me', () => {
  it('persists editable scalars and survives a re-read', async () => {
    const user = await registerUser(app);

    const update = await request(app).put('/api/v1/profile/me').set(bearer(user.accessToken)).send({
      name: 'Renamed Professional',
      bio: 'Stage and screen actor based in Mumbai.',
      location: 'Mumbai, India',
      phone: '+91 90000 00000',
    });

    expect(update.status).toBe(200);

    const reread = await request(app).get('/api/v1/profile/me').set(bearer(user.accessToken));
    expect(reread.body.data.profile).toMatchObject({
      name: 'Renamed Professional',
      bio: 'Stage and screen actor based in Mumbai.',
      location: 'Mumbai, India',
      phone: '+91 90000 00000',
    });

    // `name` lives on User and is the single source of truth for the dashboard.
    const me = await request(app).get('/api/v1/auth/me').set(bearer(user.accessToken));
    expect(me.body.data.user.name).toBe('Renamed Professional');
  });

  it('clears optional fields with null and rejects invalid bodies', async () => {
    const user = await registerUser(app);

    await request(app)
      .put('/api/v1/profile/me')
      .set(bearer(user.accessToken))
      .send({ name: 'Clear Me', bio: 'temporary', location: 'temp', phone: '123' });

    const cleared = await request(app)
      .put('/api/v1/profile/me')
      .set(bearer(user.accessToken))
      .send({ name: 'Clear Me', bio: null, location: '', phone: null });

    expect(cleared.status).toBe(200);
    expect(cleared.body.data.profile).toMatchObject({ bio: null, location: null, phone: null });

    const tooLong = await request(app)
      .put('/api/v1/profile/me')
      .set(bearer(user.accessToken))
      .send({ name: 'Clear Me', bio: 'x'.repeat(LIMITS.BIO_MAX + 1) });
    expect(tooLong.status).toBe(422);
    expect(tooLong.body.error.fieldErrors).toHaveProperty('bio');
  });

  it('refuses injected ownership, role and password fields', async () => {
    const victim = await registerUser(app, { role: Role.ACTOR });
    const attacker = await registerUser(app, { role: Role.ACTOR });

    const res = await request(app)
      .put('/api/v1/profile/me')
      .set(bearer(attacker.accessToken))
      .send({
        name: 'Escalated',
        role: Role.ADMIN,
        email: victim.email,
        userId: victim.userId,
        id: victim.profileId,
        passwordHash: 'injected',
        profileImage: '../../etc/passwd',
      });

    expect(res.status).toBe(422);

    const attackerUser = await prisma.user.findUniqueOrThrow({ where: { id: attacker.userId } });
    expect(attackerUser.role).toBe(Role.ACTOR);
    expect(attackerUser.name).not.toBe('Escalated');

    const victimUser = await prisma.user.findUniqueOrThrow({ where: { id: victim.userId } });
    expect(victimUser.email).toBe(victim.email);
  });

  it('requires authentication', async () => {
    const res = await request(app).put('/api/v1/profile/me').send({ name: 'Anonymous' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/profile/:id (public)', () => {
  it('is readable without login and excludes private fields', async () => {
    const user = await registerUser(app, { name: 'Public Face', role: Role.EDITOR });

    await request(app).put('/api/v1/profile/me').set(bearer(user.accessToken)).send({
      name: 'Public Face',
      bio: 'Editor.',
      location: 'Chennai',
      phone: '+91 98765 43210',
    });
    await request(app)
      .post('/api/v1/profile/skills')
      .set(bearer(user.accessToken))
      .send({ name: 'Avid Media Composer' });

    const res = await request(app).get(`/api/v1/profile/${user.profileId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({
      id: user.profileId,
      name: 'Public Face',
      role: Role.EDITOR,
      bio: 'Editor.',
      location: 'Chennai',
    });
    expect(res.body.data.profile.skills[0].name).toBe('Avid Media Composer');

    const profile = res.body.data.profile;
    expect(profile).not.toHaveProperty('email');
    expect(profile).not.toHaveProperty('phone');
    expect(profile).not.toHaveProperty('userId');

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(user.email);
    expect(serialized).not.toContain('+91 98765 43210');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('refreshToken');
  });

  it('returns 404 for unknown and malformed identifiers', async () => {
    expect(
      (await request(app).get('/api/v1/profile/00000000-0000-4000-8000-000000000000')).status
    ).toBe(404);
    expect((await request(app).get('/api/v1/profile/not-a-uuid')).status).toBe(404);
  });
});

describe('Skills', () => {
  it('adds, lists and removes skills, and is idempotent on re-add', async () => {
    const user = await registerUser(app);

    const created = await request(app)
      .post('/api/v1/profile/skills')
      .set(bearer(user.accessToken))
      .send({ name: 'Method Acting' });
    expect(created.status).toBe(201);
    expect(created.body.data.skill.name).toBe('Method Acting');

    // Same skill, different casing and spacing — one link, HTTP 200 not 201.
    const again = await request(app)
      .post('/api/v1/profile/skills')
      .set(bearer(user.accessToken))
      .send({ name: '  method   acting  ' });
    expect(again.status).toBe(200);
    expect(again.body.data.skill.id).toBe(created.body.data.skill.id);

    const profile = await request(app).get('/api/v1/profile/me').set(bearer(user.accessToken));
    expect(profile.body.data.profile.skills).toHaveLength(1);
    // The first-seen display label is preserved.
    expect(profile.body.data.profile.skills[0].name).toBe('Method Acting');

    const removed = await request(app)
      .delete(`/api/v1/profile/skills/${created.body.data.skill.id}`)
      .set(bearer(user.accessToken));
    expect(removed.status).toBe(204);
    expect(removed.body).toEqual({});

    const after = await request(app).get('/api/v1/profile/me').set(bearer(user.accessToken));
    expect(after.body.data.profile.skills).toHaveLength(0);
  });

  it('removing a skill affects only the caller, never the shared Skill or another profile', async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);

    const aliceLink = await request(app)
      .post('/api/v1/profile/skills')
      .set(bearer(alice.accessToken))
      .send({ name: 'Steadicam' });
    const bobLink = await request(app)
      .post('/api/v1/profile/skills')
      .set(bearer(bob.accessToken))
      .send({ name: 'steadicam' });

    // One shared Skill row, two distinct links.
    expect(await prisma.skill.count()).toBe(1);
    expect(aliceLink.body.data.skill.skillId).toBe(bobLink.body.data.skill.skillId);
    expect(aliceLink.body.data.skill.id).not.toBe(bobLink.body.data.skill.id);

    // Alice cannot delete Bob's link by guessing its id.
    const crossUser = await request(app)
      .delete(`/api/v1/profile/skills/${bobLink.body.data.skill.id}`)
      .set(bearer(alice.accessToken));
    expect(crossUser.status).toBe(404);

    await request(app)
      .delete(`/api/v1/profile/skills/${aliceLink.body.data.skill.id}`)
      .set(bearer(alice.accessToken));

    expect(await prisma.skill.count()).toBe(1);
    const bobProfile = await request(app).get('/api/v1/profile/me').set(bearer(bob.accessToken));
    expect(bobProfile.body.data.profile.skills).toHaveLength(1);
  });

  it('validates skill names and enforces the per-profile cap', async () => {
    const user = await registerUser(app);

    expect(
      (
        await request(app)
          .post('/api/v1/profile/skills')
          .set(bearer(user.accessToken))
          .send({ name: 'x' })
      ).status
    ).toBe(422);

    expect(
      (
        await request(app)
          .post('/api/v1/profile/skills')
          .set(bearer(user.accessToken))
          .send({ name: 'y'.repeat(LIMITS.SKILL_NAME_MAX + 1) })
      ).status
    ).toBe(422);

    for (let i = 0; i < LIMITS.SKILLS_PER_PROFILE_MAX; i += 1) {
      const res = await request(app)
        .post('/api/v1/profile/skills')
        .set(bearer(user.accessToken))
        .send({ name: `Skill Number ${i}` });
      expect(res.status).toBe(201);
    }

    const overflow = await request(app)
      .post('/api/v1/profile/skills')
      .set(bearer(user.accessToken))
      .send({ name: 'One Too Many' });
    expect(overflow.status).toBe(422);
    expect(overflow.body.error.code).toBe('LIMIT_EXCEEDED');
  });
});

describe('Experience', () => {
  const entry = {
    title: 'Lead Actor',
    organization: 'Monsoon Pictures',
    description: 'Feature film.',
    startDate: '2023-04-01',
    endDate: '2023-11-30',
  };

  it('creates, edits and deletes entries with exact calendar dates', async () => {
    const user = await registerUser(app);

    const created = await request(app)
      .post('/api/v1/profile/experience')
      .set(bearer(user.accessToken))
      .send(entry);

    expect(created.status).toBe(201);
    // No timezone drift: the day sent is the day returned.
    expect(created.body.data.experience).toMatchObject({
      startDate: '2023-04-01',
      endDate: '2023-11-30',
    });

    const id = created.body.data.experience.id;

    const updated = await request(app)
      .put(`/api/v1/profile/experience/${id}`)
      .set(bearer(user.accessToken))
      .send({ ...entry, title: 'Supporting Actor', endDate: null });

    expect(updated.status).toBe(200);
    expect(updated.body.data.experience).toMatchObject({
      title: 'Supporting Actor',
      endDate: null,
    });

    const reread = await request(app).get('/api/v1/profile/me').set(bearer(user.accessToken));
    expect(reread.body.data.profile.experiences).toHaveLength(1);
    expect(reread.body.data.profile.experiences[0].startDate).toBe('2023-04-01');

    expect(
      (await request(app).delete(`/api/v1/profile/experience/${id}`).set(bearer(user.accessToken)))
        .status
    ).toBe(204);
    expect(await prisma.experience.count()).toBe(0);
  });

  it('orders entries most-recent first', async () => {
    const user = await registerUser(app);

    for (const startDate of ['2020-01-01', '2024-06-15', '2022-03-10']) {
      await request(app)
        .post('/api/v1/profile/experience')
        .set(bearer(user.accessToken))
        .send({ ...entry, startDate, endDate: null });
    }

    const res = await request(app).get('/api/v1/profile/me').set(bearer(user.accessToken));
    expect(
      res.body.data.profile.experiences.map((e: { startDate: string }) => e.startDate)
    ).toEqual(['2024-06-15', '2022-03-10', '2020-01-01']);
  });

  it('rejects impossible dates, bad formats and reversed ranges', async () => {
    const user = await registerUser(app);

    const nonexistentDay = await request(app)
      .post('/api/v1/profile/experience')
      .set(bearer(user.accessToken))
      .send({ ...entry, startDate: '2023-02-30', endDate: null });
    expect(nonexistentDay.status).toBe(422);
    expect(nonexistentDay.body.error.fieldErrors).toHaveProperty('startDate');

    const badFormat = await request(app)
      .post('/api/v1/profile/experience')
      .set(bearer(user.accessToken))
      .send({ ...entry, startDate: '01/04/2023', endDate: null });
    expect(badFormat.status).toBe(422);

    const reversed = await request(app)
      .post('/api/v1/profile/experience')
      .set(bearer(user.accessToken))
      .send({ ...entry, startDate: '2023-11-30', endDate: '2023-04-01' });
    expect(reversed.status).toBe(422);
    expect(reversed.body.error.fieldErrors).toHaveProperty('endDate');

    expect(await prisma.experience.count()).toBe(0);
  });

  it('supports an ongoing engagement with a null end date', async () => {
    const user = await registerUser(app);

    const res = await request(app)
      .post('/api/v1/profile/experience')
      .set(bearer(user.accessToken))
      .send({ ...entry, endDate: null });

    expect(res.status).toBe(201);
    expect(res.body.data.experience.endDate).toBeNull();
  });

  it('blocks cross-user mutation without changing the database', async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);

    const created = await request(app)
      .post('/api/v1/profile/experience')
      .set(bearer(alice.accessToken))
      .send(entry);
    const id = created.body.data.experience.id;

    const hijackUpdate = await request(app)
      .put(`/api/v1/profile/experience/${id}`)
      .set(bearer(bob.accessToken))
      .send({ ...entry, title: 'Stolen Credit' });
    expect(hijackUpdate.status).toBe(404);

    const hijackDelete = await request(app)
      .delete(`/api/v1/profile/experience/${id}`)
      .set(bearer(bob.accessToken));
    expect(hijackDelete.status).toBe(404);

    const row = await prisma.experience.findUniqueOrThrow({ where: { id } });
    expect(row.title).toBe('Lead Actor');
    expect(await prisma.experience.count()).toBe(1);
  });

  it('ignores a submitted profileId and rejects it outright', async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);

    const res = await request(app)
      .post('/api/v1/profile/experience')
      .set(bearer(bob.accessToken))
      .send({ ...entry, profileId: alice.profileId });

    expect(res.status).toBe(422);
    expect(await prisma.experience.count()).toBe(0);
  });
});

describe('Scalar edits do not disturb related records', () => {
  it('keeps skills and experiences after a PUT /profile/me', async () => {
    const user = await registerUser(app);

    await request(app)
      .post('/api/v1/profile/skills')
      .set(bearer(user.accessToken))
      .send({ name: 'Colour Grading' });
    await request(app).post('/api/v1/profile/experience').set(bearer(user.accessToken)).send({
      title: 'Colourist',
      organization: 'Post House',
      description: null,
      startDate: '2021-01-01',
      endDate: null,
    });

    const updated = await request(app)
      .put('/api/v1/profile/me')
      .set(bearer(user.accessToken))
      .send({ name: 'Still Here', bio: 'Updated bio', location: null, phone: null });

    expect(updated.body.data.profile.skills).toHaveLength(1);
    expect(updated.body.data.profile.experiences).toHaveLength(1);
  });
});
