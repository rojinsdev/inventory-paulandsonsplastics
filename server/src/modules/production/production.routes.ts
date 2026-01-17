import { Router } from 'express';
import { productionController } from './production.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All production endpoints require production_manager role (Mobile only)
router.use(authenticate, requireRole('production_manager'));

router.post('/submit', productionController.submit);
router.get('/', productionController.list);
router.get('/daily/:date', productionController.getDailyProduction);

export default router;
