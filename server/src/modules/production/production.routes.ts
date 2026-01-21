import { Router } from 'express';
import { productionController } from './production.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// POST /submit - Production Manager only (mobile app, factory floor)
router.post('/submit',
    authenticate,
    requireRole('production_manager'),
    productionController.submit
);

// GET routes - Both admin (web) and production_manager (mobile) can view
router.get('/',
    authenticate,
    requireRole('admin', 'production_manager'),
    productionController.list
);
router.get('/daily/:date',
    authenticate,
    requireRole('admin', 'production_manager'),
    productionController.getDailyProduction
);

export default router;
