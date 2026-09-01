import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';

const router = Router();

/**
 * GET /api/v1/test/admin
 * Temporary dev route to verify RBAC middleware.
 * Protected: requires authentication + ADMIN role.
 * Can be removed after Week 1 validation.
 */
router.get(
  '/admin',
  authenticate,
  requireRole('ADMIN'),
  (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    sendSuccess(res, {
      message: 'Welcome, Admin!',
      user: authReq.user,
    }, 'Admin access granted');
  }
);

export default router;
