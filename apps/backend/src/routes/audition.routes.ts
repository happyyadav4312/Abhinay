import { Router } from 'express';
import {
  getAuditionController,
  listMyAuditionsController,
  requestAuditionController,
  submitAuditionController,
  updateAuditionStatusController,
} from '../controllers/audition.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireTrustedOrigin } from '../middleware/origin.middleware';
import { uploadAuditionVideo } from '../middleware/upload.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(asyncHandler(authenticate));

router.get('/mine', asyncHandler(listMyAuditionsController));

router.post('/', requireTrustedOrigin, asyncHandler(requestAuditionController));

router.get('/:id', asyncHandler(getAuditionController));

router.post(
  '/:id/submissions',
  requireTrustedOrigin,
  uploadAuditionVideo,
  asyncHandler(submitAuditionController)
);

router.patch(
  '/:id/status',
  requireTrustedOrigin,
  asyncHandler(updateAuditionStatusController)
);

export default router;
