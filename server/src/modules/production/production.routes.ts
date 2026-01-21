import { Router } from 'express';
import { productionController } from './production.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// Production endpoints accessible by both admin (web) and production_manager (mobile)
router.use(authenticate, requireRole('admin', 'production_manager'));

router.post('/submit', productionController.submit);
router.get('/', productionController.list);
router.get('/daily/:date', productionController.getDailyProduction);

export default router;
