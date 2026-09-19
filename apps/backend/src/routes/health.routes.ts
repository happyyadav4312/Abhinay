import { Router } from 'express';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ErrorCode } from '../utils/errors';
import { sendError, sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/** GET /api/v1/health — liveness plus a real database round-trip. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    let database = 'disconnected';

    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'connected';
    } catch {
      database = 'disconnected';
    }

    if (database !== 'connected') {
      sendError(res, 'Database is not connected', 503, ErrorCode.SERVICE_UNAVAILABLE);
      return;
    }

    sendSuccess(
      res,
      {
        api: 'ok',
        database,
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
      },
      'Abhinay API is running'
    );
  })
);

export default router;
