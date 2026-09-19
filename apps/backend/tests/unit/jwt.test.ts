import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../../src/config/env';
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../src/utils/jwt';

const user = { id: 'c0ffee00-0000-4000-8000-000000000001', email: 'a@b.test', role: Role.ACTOR };

describe('access tokens', () => {
  it('round-trips identity and purpose', () => {
    const payload = verifyAccessToken(generateAccessToken(user));
    expect(payload).toMatchObject({
      sub: user.id,
      email: user.email,
      role: Role.ACTOR,
      typ: 'access',
    });
  });

  it('rejects a token signed with the refresh secret', () => {
    const forged = jwt.sign({ typ: 'access' }, env.JWT_REFRESH_SECRET, {
      algorithm: 'HS256',
      issuer: 'abhinay-api',
      subject: user.id,
      expiresIn: '15m',
    });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it('rejects the "none" algorithm', () => {
    const unsigned = jwt.sign({ typ: 'access', email: user.email }, '', {
      algorithm: 'none',
      issuer: 'abhinay-api',
      subject: user.id,
    });
    expect(() => verifyAccessToken(unsigned)).toThrow();
  });

  it('rejects a wrong issuer', () => {
    const wrongIssuer = jwt.sign({ typ: 'access', email: user.email }, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      issuer: 'somebody-else',
      subject: user.id,
      expiresIn: '15m',
    });
    expect(() => verifyAccessToken(wrongIssuer)).toThrow();
  });

  it('rejects an expired token using a controlled clock rather than a real wait', () => {
    const expired = jwt.sign({ typ: 'access', email: user.email }, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      issuer: 'abhinay-api',
      subject: user.id,
      expiresIn: '-1s',
    });
    expect(() => verifyAccessToken(expired)).toThrow(jwt.TokenExpiredError);
  });
});

describe('refresh tokens', () => {
  it('carries a unique jti and a future expiry', () => {
    const a = generateRefreshToken(user.id);
    const b = generateRefreshToken(user.id);

    expect(a.jti).not.toBe(b.jti);
    expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(verifyRefreshToken(a.token)).toMatchObject({ sub: user.id, jti: a.jti, typ: 'refresh' });
  });

  it('cannot be used as an access token, and vice versa', () => {
    const refresh = generateRefreshToken(user.id);
    expect(() => verifyAccessToken(refresh.token)).toThrow();
    expect(() => verifyRefreshToken(generateAccessToken(user))).toThrow();
  });

  it('is stored only as a SHA-256 digest', () => {
    const { token } = generateRefreshToken(user.id);
    const digest = hashRefreshToken(token);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(token);
    expect(hashRefreshToken(token)).toBe(digest);
    expect(hashRefreshToken(`${token}x`)).not.toBe(digest);
  });
});
