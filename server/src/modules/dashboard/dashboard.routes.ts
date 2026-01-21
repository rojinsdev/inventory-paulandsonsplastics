import { Router } from 'express';
import { dashboardController } from './dashboard.controller';

const router = Router();

router.get('/stats', dashboardController.getStats);
router.get('/comprehensive', dashboardController.getComprehensive);

export default router;
