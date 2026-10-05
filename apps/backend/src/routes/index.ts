import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import profileRoutes from './profile.routes';
import castingRoutes from './casting.routes';
import applicationRoutes from './application.routes';
import adminRoutes from './admin.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/casting', castingRoutes);
router.use('/applications', applicationRoutes);
router.use('/admin', adminRoutes);

export default router;
