import { Router } from 'express';
import {
  createConversationController,
  getConversationController,
  getMessagesController,
  listConversationsController,
  markMessagesReadController,
  sendMessageController,
} from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireTrustedOrigin } from '../middleware/origin.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// All chat routes require authentication
router.use(asyncHandler(authenticate));

router.post(
  '/conversations',
  requireTrustedOrigin,
  asyncHandler(createConversationController)
);

router.get('/conversations', asyncHandler(listConversationsController));

router.get('/conversations/:id', asyncHandler(getConversationController));

router.get('/conversations/:id/messages', asyncHandler(getMessagesController));

router.post(
  '/conversations/:id/messages',
  requireTrustedOrigin,
  asyncHandler(sendMessageController)
);

router.patch(
  '/conversations/:id/messages/read',
  requireTrustedOrigin,
  asyncHandler(markMessagesReadController)
);

export default router;
