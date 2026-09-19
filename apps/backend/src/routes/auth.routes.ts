import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import {
  getMeController,
  loginController,
  logoutController,
  refreshController,
  registerController,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireClientHeader, requireTrustedOrigin } from '../middleware/origin.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { ErrorCode } from '../utils/errors';

const router = Router();

/**
 * Modest in-process throttling on credential endpoints. Deliberately not backed
 * by Redis or any external cache — this is a local development stack.
 */
const authLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
    error: {
      code: ErrorCode.TOO_MANY_REQUESTS,
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
});

router.post('/register', authLimiter, requireTrustedOrigin, asyncHandler(registerController));
router.post('/login', authLimiter, requireTrustedOrigin, asyncHandler(loginController));

// Cookie-authenticated: additionally require the non-simple client header.
router.post(
  '/refresh',
  authLimiter,
  requireTrustedOrigin,
  requireClientHeader,
  asyncHandler(refreshController)
);
router.post('/logout', requireTrustedOrigin, requireClientHeader, asyncHandler(logoutController));

router.get('/me', asyncHandler(authenticate), asyncHandler(getMeController));

export default router;
