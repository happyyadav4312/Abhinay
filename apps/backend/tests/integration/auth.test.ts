import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { env } from '../../src/config/env';
import { PUBLIC_ROLES } from '../../src/validators/common';
import {
  bearer,
  CLIENT_HEADERS,
  cookieFromResponse,
  disconnect,
  registerUser,
  resetDatabase,
  uniqueEmail,
  VALID_PASSWORD,
} from '../helpers';

beforeEach(resetDatabase);
afterAll(disconnect);

describe('POST /api/v1/auth/register', () => {
  it('registers every publicly permitted role and creates exactly one profile', async () => {
    for (const role of PUBLIC_ROLES) {
      const email = uniqueEmail(role.toLowerCase());
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Ada Reel', email, password: VALID_PASSWORD, role });

      expect(res.status).toBe(201);
      expect(res.body.data.user).toMatchObject({ email, role, name: 'Ada Reel' });
      expect(res.body.data.accessToken).toEqual(expect.any(String));

      const profiles = await prisma.profile.findMany({
        where: { user: { email } },
      });
      expect(profiles).toHaveLength(1);
    }
  });

  it('rejects ADMIN, unknown roles, and extra privileged fields', async () => {
    const admin = await request(app).post('/api/v1/auth/register').send({
      name: 'Sneaky Admin',
      email: uniqueEmail(),
      password: VALID_PASSWORD,
      role: 'ADMIN',
    });
    expect(admin.status).toBe(422);
    expect(admin.body.error.fieldErrors).toHaveProperty('role');

    const unknown = await request(app).post('/api/v1/auth/register').send({
      name: 'Nobody',
      email: uniqueEmail(),
      password: VALID_PASSWORD,
      role: 'SUPERUSER',
    });
    expect(unknown.status).toBe(422);

    const injected = await request(app).post('/api/v1/auth/register').send({
      name: 'Injector',
      email: uniqueEmail(),
      password: VALID_PASSWORD,
      role: Role.ACTOR,
      passwordHash: 'pre-computed',
      id: '00000000-0000-4000-8000-000000000000',
    });
    expect(injected.status).toBe(422);

    expect(await prisma.user.count()).toBe(0);
  });

  it('rejects malformed fields and passwords shorter than the policy', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'A',
      email: 'not-an-email',
      password: 'short',
      role: Role.EDITOR,
    });

    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fieldErrors).sort()).toEqual(['email', 'name', 'password']);
  });

  it('normalizes email and treats a differently-cased duplicate as a conflict', async () => {
    const email = uniqueEmail();

    const first = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'First Person',
        email: `  ${email.toUpperCase()}  `,
        password: VALID_PASSWORD,
        role: Role.DIRECTOR,
      });
    expect(first.status).toBe(201);
    expect(first.body.data.user.email).toBe(email);

    const duplicate = await request(app).post('/api/v1/auth/register').send({
      name: 'Second Person',
      email,
      password: VALID_PASSWORD,
      role: Role.ACTOR,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_TAKEN');

    expect(await prisma.user.count()).toBe(1);
  });

  it('keeps email unique and profiles 1:1 under concurrent duplicate registration', async () => {
    const email = uniqueEmail();
    const body = { name: 'Race Runner', email, password: VALID_PASSWORD, role: Role.PRODUCER };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/api/v1/auth/register').send(body))
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.profile.count()).toBe(1);
  });

  it('stores a bcrypt hash and never returns password material', async () => {
    const email = uniqueEmail();
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Hash Check',
      email,
      password: VALID_PASSWORD,
      role: Role.ACTOR,
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).not.toBe(VALID_PASSWORD);
    expect(user.passwordHash.startsWith('$2')).toBe(true);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(VALID_PASSWORD);
    expect(serialized).not.toContain(user.passwordHash);
    expect(serialized).not.toContain('passwordHash');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('succeeds with valid credentials and sets an HttpOnly refresh cookie', async () => {
    const user = await registerUser(app);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email.toUpperCase(), password: user.password });

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.userId);

    const cookie = cookieFromResponse(res, 'refreshToken');
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie?.toLowerCase()).toContain('samesite=lax');
  });

  it('returns the same generic error for a wrong password and an unknown account', async () => {
    const user = await registerUser(app);

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'definitely not the password' });

    const unknownAccount = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail('ghost'), password: VALID_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownAccount.body.error.message);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('accepts a valid access token', async () => {
    const user = await registerUser(app, { name: 'Valid Identity' });

    const res = await request(app).get('/api/v1/auth/me').set(bearer(user.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: user.userId, name: 'Valid Identity' });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('rejects missing, malformed, tampered, expired and wrong-purpose tokens', async () => {
    const user = await registerUser(app);

    const missing = await request(app).get('/api/v1/auth/me');
    expect(missing.status).toBe(401);

    const malformed = await request(app).get('/api/v1/auth/me').set(bearer('not.a.jwt'));
    expect(malformed.status).toBe(401);

    // Same payload, attacker-chosen signing key.
    const tampered = jwt.sign(
      { email: user.email, role: Role.ADMIN, typ: 'access' },
      'an-attacker-controlled-signing-key-value',
      { algorithm: 'HS256', issuer: 'abhinay-api', subject: user.userId, expiresIn: '15m' }
    );
    expect((await request(app).get('/api/v1/auth/me').set(bearer(tampered))).status).toBe(401);

    // Controlled clock: minted already-expired rather than waiting 15 minutes.
    const expired = jwt.sign(
      { email: user.email, role: Role.ACTOR, typ: 'access' },
      env.JWT_ACCESS_SECRET,
      { algorithm: 'HS256', issuer: 'abhinay-api', subject: user.userId, expiresIn: '-1s' }
    );
    expect((await request(app).get('/api/v1/auth/me').set(bearer(expired))).status).toBe(401);

    // A refresh token must never be accepted as an access token.
    const refreshRaw = user.refreshCookie.split('=')[1].split(';')[0];
    const asAccess = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(decodeURIComponent(refreshRaw)));
    expect(asAccess.status).toBe(401);
  });

  it('reflects a role change made in the database rather than the stale token claim', async () => {
    const user = await registerUser(app, { role: Role.ACTOR });
    await prisma.user.update({ where: { id: user.userId }, data: { role: Role.EDITOR } });

    const res = await request(app).get('/api/v1/auth/me').set(bearer(user.accessToken));
    expect(res.body.data.user.role).toBe(Role.EDITOR);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the session and issues a new refresh cookie', async () => {
    const user = await registerUser(app);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', user.refreshCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));

    const rotated = cookieFromResponse(res, 'refreshToken');
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(user.refreshCookie);

    // The new token works and the old one is now dead.
    const withNew = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', rotated as string);
    expect(withNew.status).toBe(200);

    const reused = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', user.refreshCookie);
    expect(reused.status).toBe(401);
  });

  it('allows at most one success when the same token is consumed concurrently', async () => {
    const user = await registerUser(app);

    const attempts = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app)
          .post('/api/v1/auth/refresh')
          .set(CLIENT_HEADERS)
          .set('Cookie', user.refreshCookie)
      )
    );

    expect(attempts.filter((r) => r.status === 200)).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 401)).toHaveLength(5);
  });

  it('rejects a missing cookie, an expired record, and a revoked record', async () => {
    const missing = await request(app).post('/api/v1/auth/refresh').set(CLIENT_HEADERS);
    expect(missing.status).toBe(401);

    const expiredUser = await registerUser(app);
    await prisma.refreshToken.updateMany({
      where: { userId: expiredUser.userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', expiredUser.refreshCookie);
    expect(expired.status).toBe(401);

    const revokedUser = await registerUser(app);
    await prisma.refreshToken.updateMany({
      where: { userId: revokedUser.userId },
      data: { revokedAt: new Date() },
    });
    const revoked = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', revokedUser.refreshCookie);
    expect(revoked.status).toBe(401);
  });

  it('recovers a rotation whose response never reached the client', async () => {
    const user = await registerUser(app);

    // The client navigates away: the server rotates, the browser never stores
    // the new cookie, and the next attempt arrives with the consumed token.
    const lost = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', user.refreshCookie);
    expect(lost.status).toBe(200);

    const retry = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', user.refreshCookie);

    expect(retry.status).toBe(200);
    const recovered = cookieFromResponse(retry, 'refreshToken');
    expect(recovered).toBeDefined();

    // The recovered cookie is a working session.
    const after = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', recovered as string);
    expect(after.status).toBe(200);
  });

  it('refuses the consumed token once its replacement has been used', async () => {
    const user = await registerUser(app);

    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', user.refreshCookie);
    const replacement = cookieFromResponse(rotated, 'refreshToken') as string;

    // The real client did receive the replacement, so presenting the old token
    // is reuse, not an interrupted rotation.
    await request(app).post('/api/v1/auth/refresh').set(CLIENT_HEADERS).set('Cookie', replacement);

    const reused = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', user.refreshCookie);
    expect(reused.status).toBe(401);
  });

  it('refuses a consumed token once the recovery window has passed', async () => {
    const user = await registerUser(app);
    const raw = decodeURIComponent(user.refreshCookie.split('=')[1].split(';')[0]);
    const { jti } = jwt.decode(raw) as { jti: string };

    await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', user.refreshCookie);

    // Age the revocation past the grace window rather than waiting for it.
    await prisma.refreshToken.update({
      where: { id: jti },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const late = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', user.refreshCookie);
    expect(late.status).toBe(401);
  });

  it('stores only a digest of the refresh token, never the bearer value', async () => {
    const user = await registerUser(app);
    const raw = decodeURIComponent(user.refreshCookie.split('=')[1].split(';')[0]);

    const record = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: user.userId },
    });

    expect(record.tokenHash).not.toBe(raw);
    expect(record.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the refresh session, clears the cookie, and is idempotent', async () => {
    const user = await registerUser(app);

    const first = await request(app)
      .post('/api/v1/auth/logout')
      .set(CLIENT_HEADERS)
      .set('Cookie', user.refreshCookie);

    expect(first.status).toBe(200);
    const cleared = cookieFromResponse(first, 'refreshToken');
    expect(cleared).toContain('Path=/api/v1/auth');
    expect(cleared).toMatch(/refreshToken=;|Expires=Thu, 01 Jan 1970/);

    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', user.refreshCookie);
    expect(reuse.status).toBe(401);

    // Calling logout again with the same (now dead) cookie still succeeds.
    const second = await request(app)
      .post('/api/v1/auth/logout')
      .set(CLIENT_HEADERS)
      .set('Cookie', user.refreshCookie);
    expect(second.status).toBe(200);

    // And with no cookie at all.
    const third = await request(app).post('/api/v1/auth/logout').set(CLIENT_HEADERS);
    expect(third.status).toBe(200);
  });

  it('works when the access token has already expired', async () => {
    const user = await registerUser(app);
    const expiredAccess = jwt.sign(
      { email: user.email, role: Role.ACTOR, typ: 'access' },
      env.JWT_ACCESS_SECRET,
      { algorithm: 'HS256', issuer: 'abhinay-api', subject: user.userId, expiresIn: '-1s' }
    );

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set(CLIENT_HEADERS)
      .set(bearer(expiredAccess))
      .set('Cookie', user.refreshCookie);

    expect(res.status).toBe(200);
  });

  it('documented limitation: an already-issued access token stays valid until it expires', async () => {
    const user = await registerUser(app);

    await request(app)
      .post('/api/v1/auth/logout')
      .set(CLIENT_HEADERS)
      .set('Cookie', user.refreshCookie);

    // This asserts the real behaviour rather than a false "global logout" claim.
    // The refresh session is dead, so the access token cannot be renewed and the
    // session ends when it expires (15 minutes by default).
    const stillValid = await request(app).get('/api/v1/auth/me').set(bearer(user.accessToken));
    expect(stillValid.status).toBe(200);
  });
});

describe('CORS, origin validation and required headers', () => {
  it('answers preflight for the configured origin and refuses others', async () => {
    const allowed = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', env.FRONTEND_URL)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-abhinay-client');

    expect(allowed.headers['access-control-allow-origin']).toBe(env.FRONTEND_URL);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(allowed.headers['access-control-allow-headers']?.toLowerCase()).toContain(
      'x-abhinay-client'
    );

    const denied = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects auth writes from an untrusted or null browser origin', async () => {
    const evil = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://evil.example')
      .send({ email: uniqueEmail(), password: VALID_PASSWORD });
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe('FORBIDDEN_ORIGIN');

    const nullOrigin = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'null')
      .send({ email: uniqueEmail(), password: VALID_PASSWORD });
    expect(nullOrigin.status).toBe(403);
  });

  it('requires X-Abhinay-Client on the cookie-authenticated endpoints', async () => {
    const user = await registerUser(app);

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', user.refreshCookie);
    expect(refresh.status).toBe(403);
    expect(refresh.body.error.code).toBe('MISSING_CLIENT_HEADER');

    const logout = await request(app).post('/api/v1/auth/logout').set('Cookie', user.refreshCookie);
    expect(logout.status).toBe(403);

    // The session survives the rejected calls.
    const stillWorks = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CLIENT_HEADERS)
      .set('Cookie', user.refreshCookie);
    expect(stillWorks.status).toBe(200);
  });
});

describe('GET /api/v1/admin/users (narrow RBAC demonstration)', () => {
  it('returns 401 without a token, 403 for a non-admin, and data for an admin', async () => {
    const actor = await registerUser(app, { role: Role.ACTOR });

    expect((await request(app).get('/api/v1/admin/users')).status).toBe(401);

    const denied = await request(app).get('/api/v1/admin/users').set(bearer(actor.accessToken));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');

    // Promote in the database, then reuse the SAME token: authorization must
    // follow the current role, not the claim baked into the token.
    await prisma.user.update({ where: { id: actor.userId }, data: { role: Role.ADMIN } });

    const allowed = await request(app).get('/api/v1/admin/users').set(bearer(actor.accessToken));
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.users[0]).not.toHaveProperty('passwordHash');
    expect(allowed.body.data.pagination).toMatchObject({ page: 1, total: 1 });
  });
});
