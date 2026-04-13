import { Router } from 'express';
import { systemController } from './system.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All system routes require authentication and admin role
router.use(authenticate);
router.use(requireRole('admin'));

// System health endpoints
router.get('/health', systemController.getHealthSummary.bind(systemController));
router.get('/errors', systemController.getRecentErrors.bind(systemController));
router.get('/dashboard', systemController.getDashboardData.bind(systemController));

// Validation endpoints
router.get('/validate/stock', systemController.validateStockConsistency.bind(systemController));
router.get('/validate/order/:orderId', systemController.validateOrderConsistency.bind(systemController));

// Error management
router.post('/errors/:errorId/resolve', systemController.resolveError.bind(systemController));

export default router;