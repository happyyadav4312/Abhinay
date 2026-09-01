import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import testRoutes from './test.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/test', testRoutes);

export default router;
