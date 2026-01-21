import { Router } from 'express';
import { dashboardController } from './dashboard.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// Dashboard is admin-only (web portal)
router.use(authenticate, requireRole('admin'));

router.get('/stats', dashboardController.getStats);
router.get('/comprehensive', dashboardController.getComprehensive);

export default router;
