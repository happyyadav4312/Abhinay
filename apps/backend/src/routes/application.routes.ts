import { Router } from 'express';
import { listMyApplicationsController } from '../controllers/application.controller';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * The caller's own applications. Applying itself is
 * POST /casting/:id/applications, next to the role it targets.
 */
router.get('/mine', asyncHandler(authenticate), asyncHandler(listMyApplicationsController));

export default router;
