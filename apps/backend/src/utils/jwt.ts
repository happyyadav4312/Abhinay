import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';

const ALGORITHM = 'HS256';
const ISSUER = 'abhinay-api';

/**
 * `typ` pins each token to one purpose. Without it a refresh token signed with
 * a leaked/shared secret could be replayed as an access token.
 */
export const TokenPurpose = {
  ACCESS: 'access',
  REFRESH: 'refresh',
} as const;

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  typ: typeof TokenPurpose.ACCESS;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Token identifier; also the RefreshToken primary key. */
  jti: string;
  typ: typeof TokenPurpose.REFRESH;
}

export interface SignedRefreshToken {
  token: string;
  jti: string;
  expiresAt: Date;
}

export function generateAccessToken(user: { id: string; email: string; role: Role }): string {
  const options: SignOptions = {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_EXPIRES_IN as SignOptions['expiresIn'],
  };

  return jwt.sign(
    { email: user.email, role: user.role, typ: TokenPurpose.ACCESS },
    env.JWT_ACCESS_SECRET,
    options
  );
}

/**
 * Mint a refresh token. The caller is responsible for persisting
 * `{ jti, hashRefreshToken(token), expiresAt }` before handing the token out.
 */
export function generateRefreshToken(userId: string): SignedRefreshToken {
  const jti = crypto.randomUUID();

  const options: SignOptions = {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    subject: userId,
    jwtid: jti,
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN as SignOptions['expiresIn'],
  };

  const token = jwt.sign({ typ: TokenPurpose.REFRESH }, env.JWT_REFRESH_SECRET, options);
  const decoded = jwt.decode(token) as { exp: number };

  return { token, jti, expiresAt: new Date(decoded.exp * 1000) };
}

/** Throws (JsonWebTokenError / TokenExpiredError) on any failure. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
  }) as jwt.JwtPayload;

  if (payload.typ !== TokenPurpose.ACCESS) {
    throw new jwt.JsonWebTokenError('Token is not an access token');
  }
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new jwt.JsonWebTokenError('Malformed access token payload');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    role: payload.role as Role,
    typ: TokenPurpose.ACCESS,
  };
}

/** Throws (JsonWebTokenError / TokenExpiredError) on any failure. */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
  }) as jwt.JwtPayload;

  if (payload.typ !== TokenPurpose.REFRESH) {
    throw new jwt.JsonWebTokenError('Token is not a refresh token');
  }
  if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
    throw new jwt.JsonWebTokenError('Malformed refresh token payload');
  }

  return { sub: payload.sub, jti: payload.jti, typ: TokenPurpose.REFRESH };
}

/**
 * Only this digest is stored. A dump of `refresh_tokens` therefore yields no
 * usable bearer tokens. SHA-256 (not bcrypt) is correct here: the input is a
 * 300+ bit signed JWT, not a guessable human secret.
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
