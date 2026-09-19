import { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env';
import { unauthenticated } from '../utils/errors';
import { SignedRefreshToken } from '../utils/jwt';
import { sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { parseOrThrow } from '../validators/common';
import { loginSchema, registerSchema } from '../validators/auth.validator';
import * as authService from '../services/auth.service';

export const REFRESH_COOKIE_NAME = 'refreshToken';

/**
 * The refresh cookie is scoped to the auth routes, so it is not attached to
 * every profile request. `Secure` follows the environment: local HTTP
 * development works while production over HTTPS stays strict.
 *
 * `SameSite=Lax` (not Strict) so that a user arriving from an external link
 * still has their session restored; the cookie is only ever read by POST
 * endpoints that additionally require the `X-Abhinay-Client` header.
 */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function refreshCookieOptions(maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    ...(maxAgeMs === undefined ? {} : { maxAge: maxAgeMs }),
  };
}

function setRefreshCookie(res: Response, refresh: SignedRefreshToken): void {
  res.cookie(
    REFRESH_COOKIE_NAME,
    refresh.token,
    refreshCookieOptions(Math.max(0, refresh.expiresAt.getTime() - Date.now()))
  );
}

/** Cleared with the same path/attributes it was set with, or the browser keeps it. */
function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}

/** POST /api/v1/auth/register */
export async function registerController(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(registerSchema, req.body);
  const result = await authService.register(input);

  setRefreshCookie(res, result.refreshToken);
  sendSuccess(
    res,
    { user: result.user, accessToken: result.accessToken },
    'Registration successful',
    201
  );
}

/** POST /api/v1/auth/login */
export async function loginController(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(loginSchema, req.body);
  const result = await authService.login(input);

  setRefreshCookie(res, result.refreshToken);
  sendSuccess(res, { user: result.user, accessToken: result.accessToken }, 'Login successful');
}

/** POST /api/v1/auth/refresh — cookie flow, rotates the session. */
export async function refreshController(req: Request, res: Response): Promise<void> {
  const token: unknown = req.cookies?.[REFRESH_COOKIE_NAME];

  if (typeof token !== 'string' || token.length === 0) {
    // Clear any stale cookie so the browser stops replaying a dead session.
    clearRefreshCookie(res);
    throw unauthenticated('Refresh token is required');
  }

  try {
    const result = await authService.rotateRefreshToken(token);
    setRefreshCookie(res, result.refreshToken);
    sendSuccess(
      res,
      { user: result.user, accessToken: result.accessToken },
      'Access token refreshed'
    );
  } catch (error) {
    clearRefreshCookie(res);
    throw error;
  }
}

/**
 * POST /api/v1/auth/logout
 * Idempotent, and works with an expired or absent access token.
 */
export async function logoutController(req: Request, res: Response): Promise<void> {
  const token: unknown = req.cookies?.[REFRESH_COOKIE_NAME];

  await authService.logout(typeof token === 'string' ? token : undefined);

  clearRefreshCookie(res);
  sendSuccess(res, null, 'Logged out');
}

/** GET /api/v1/auth/me */
export async function getMeController(req: Request, res: Response): Promise<void> {
  const { user } = req as AuthenticatedRequest;
  sendSuccess(res, { user: await authService.getUserById(user.id) }, 'Current user');
}
