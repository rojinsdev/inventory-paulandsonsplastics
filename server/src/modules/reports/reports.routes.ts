import { Router } from 'express';
import { reportsController } from './reports.controller';
import { productionController } from '../production/production.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All report endpoints require admin role
router.use(authenticate, requireRole('admin'));

router.get('/production', productionController.list);
router.get('/inventory', reportsController.getInventoryReport);
router.get('/sales', reportsController.getSalesReport);

export default router;
