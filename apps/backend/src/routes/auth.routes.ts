import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.middleware';
import {
  registerController,
  loginController,
  refreshController,
  logoutController,
  getMeController,
} from '../controllers/auth.controller';

const router = Router();

// Rate limiting for auth endpoints — 20 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', authLimiter, registerController);
router.post('/login', authLimiter, loginController);
router.post('/refresh', authLimiter, refreshController);
router.post('/logout', logoutController);
router.get('/me', authenticate, getMeController);

export default router;
