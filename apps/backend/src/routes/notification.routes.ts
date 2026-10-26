import { Router } from 'express';
import {
  listNotificationsController,
  markAllNotificationsAsReadController,
  markNotificationAsReadController,
} from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(asyncHandler(authenticate));

router.get('/', asyncHandler(listNotificationsController));
router.post('/read-all', asyncHandler(markAllNotificationsAsReadController));
router.patch('/:id/read', asyncHandler(markNotificationAsReadController));

export default router;
