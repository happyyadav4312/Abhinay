import { Router } from 'express';
import { Role } from '@prisma/client';
import { listUsersController } from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Narrow RBAC demonstration only — read-only, paginated, safe projections.
router.get(
  '/users',
  asyncHandler(authenticate),
  requireRole(Role.ADMIN),
  asyncHandler(listUsersController)
);

export default router;
