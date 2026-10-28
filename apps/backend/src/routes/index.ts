import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import profileRoutes from './profile.routes';
import castingRoutes from './casting.routes';
import applicationRoutes from './application.routes';
import adminRoutes from './admin.routes';
import notificationRoutes from './notification.routes';
import chatRoutes from './chat.routes';
import auditionRoutes from './audition.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/casting', castingRoutes);
router.use('/applications', applicationRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/chat', chatRoutes);
router.use('/auditions', auditionRoutes);

export default router;
