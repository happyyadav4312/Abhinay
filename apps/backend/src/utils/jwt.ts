import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthUser } from '../types';

/**
 * Generate a short-lived access token.
 */
export function generateAccessToken(user: AuthUser): string {
  const options: SignOptions = {
    expiresIn: env.ACCESS_TOKEN_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  };

  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    env.JWT_ACCESS_SECRET,
    options
  );
}

/**
 * Generate a long-lived refresh token.
 */
export function generateRefreshToken(user: AuthUser): string {
  const options: SignOptions = {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  };

  return jwt.sign(
    { id: user.id },
    env.JWT_REFRESH_SECRET,
    options
  );
}

/**
 * Verify and decode an access token.
 */
export function verifyAccessToken(token: string): AuthUser {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser;
}

/**
 * Verify and decode a refresh token.
 * Returns only the user ID — caller must fetch full user data.
 */
export function verifyRefreshToken(token: string): { id: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { id: string };
}
