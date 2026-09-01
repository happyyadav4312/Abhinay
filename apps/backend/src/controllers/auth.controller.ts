import { Request, Response } from 'express';
import { env } from '../config/env';
import { sendSuccess, sendError } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import {
  register,
  login,
  refresh,
  getMe,
  registerSchema,
  loginSchema,
  ServiceError,
} from '../services/auth.service';

// Cookie options for the HttpOnly refresh token
const REFRESH_COOKIE_NAME = 'refreshToken';

function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

/**
 * POST /api/v1/auth/register
 */
export async function registerController(req: Request, res: Response): Promise<void> {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => e.message);
      sendError(res, 'Validation failed', 422, errors);
      return;
    }

    const result = await register(parsed.data);

    // Set refresh token as HttpOnly cookie
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions());

    sendSuccess(
      res,
      {
        user: result.user,
        accessToken: result.accessToken,
      },
      'Registration successful',
      201
    );
  } catch (err) {
    if (err instanceof ServiceError) {
      sendError(res, err.message, err.statusCode);
      return;
    }
    throw err;
  }
}

/**
 * POST /api/v1/auth/login
 */
export async function loginController(req: Request, res: Response): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => e.message);
      sendError(res, 'Validation failed', 422, errors);
      return;
    }

    const result = await login(parsed.data);

    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions());

    sendSuccess(res, {
      user: result.user,
      accessToken: result.accessToken,
    }, 'Login successful');
  } catch (err) {
    if (err instanceof ServiceError) {
      sendError(res, err.message, err.statusCode);
      return;
    }
    throw err;
  }
}

/**
 * POST /api/v1/auth/refresh
 */
export async function refreshController(req: Request, res: Response): Promise<void> {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      sendError(res, 'Refresh token is required', 401);
      return;
    }

    const result = await refresh(refreshToken);

    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions());

    sendSuccess(res, {
      accessToken: result.accessToken,
    }, 'Token refreshed');
  } catch (err) {
    if (err instanceof ServiceError) {
      sendError(res, err.message, err.statusCode);
      return;
    }
    // JWT verification errors
    sendError(res, 'Invalid or expired refresh token', 401);
  }
}

/**
 * POST /api/v1/auth/logout
 */
export function logoutController(_req: Request, res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/v1/auth',
  });

  sendSuccess(res, null, 'Logged out successfully');
}

/**
 * GET /api/v1/auth/me
 */
export async function getMeController(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await getMe(authReq.user.id);

    sendSuccess(res, { user }, 'User retrieved');
  } catch (err) {
    if (err instanceof ServiceError) {
      sendError(res, err.message, err.statusCode);
      return;
    }
    throw err;
  }
}
