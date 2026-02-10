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
router.get('/logs',
    authenticate,
    requireRole('admin', 'production_manager'),
    productionController.list
);
router.get('/last-session',
    authenticate,
    requireRole('admin', 'production_manager'),
    productionController.getLastSession
);

router.get('/daily/:date',
    authenticate,
    requireRole('admin', 'production_manager'),
    productionController.getDailyProduction
);

// Production Requests (Demand Signaling)
router.get('/requests',
    authenticate,
    requireRole('admin', 'production_manager'),
    productionController.listRequests
);

router.patch('/requests/:id',
    authenticate,
    requireRole('admin', 'production_manager'),
    productionController.updateRequestStatus
);

// Cap Production
router.post('/caps/submit',
    authenticate,
    requireRole('production_manager'),
    productionController.submitCapProduction
);

router.get('/caps/logs',
    authenticate,
    requireRole('admin', 'production_manager'),
    productionController.listCapLogs
);

export default router;
