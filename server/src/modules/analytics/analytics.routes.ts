import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All analytics endpoints are admin-only (web portal)
router.use(authenticate, requireRole('admin'));

router.get('/cycle-time-loss', analyticsController.getCycleTimeLoss);
router.get('/weight-wastage', analyticsController.getWeightWastage);
router.get('/downtime-breakdown', analyticsController.getDowntimeBreakdown);
router.get('/machine-efficiency', analyticsController.getMachineEfficiency);
router.get('/shift-comparison', analyticsController.getShiftComparison);
router.get('/action-required', analyticsController.getActionRequired);
router.get('/summary', analyticsController.getDashboardSummary);

export default router;
