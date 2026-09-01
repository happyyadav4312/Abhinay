import { Router } from 'express';
import { prisma } from '../config/database';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

/**
 * GET /api/v1/health
 * Basic health check + database connectivity verification.
 */
router.get('/', async (_req, res) => {
  let dbStatus = 'disconnected';

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  const isHealthy = dbStatus === 'connected';

  if (isHealthy) {
    sendSuccess(res, {
      api: 'ok',
      database: dbStatus,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    }, 'Abhinay API is running');
  } else {
    sendError(res, 'Database is not connected', 503, [
      `Database status: ${dbStatus}`,
    ]);
  }
});

export default router;
