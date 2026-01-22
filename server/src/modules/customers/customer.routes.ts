import { Router } from 'express';
import { customerController } from './customer.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All customer endpoints require admin role (Web only)
router.use(authenticate, requireRole('admin'));

// Customer Segmentation routes (must be before /:id to avoid conflicts)
router.get('/segments/:segment', customerController.getBySegment);
router.get('/vip/list', customerController.getVIP);
router.get('/at-risk/list', customerController.getAtRisk);
router.get('/stats/overview', customerController.getStats);

// Basic CRUD routes
router.post('/', customerController.create);
router.get('/', customerController.list);
router.get('/:id', customerController.get);
router.put('/:id', customerController.update);
router.delete('/:id', customerController.delete);

// Customer Profile & Analytics routes
router.get('/:id/profile', customerController.getProfile);
router.get('/:id/purchase-history', customerController.getPurchaseHistory);
router.get('/:id/analytics', customerController.getAnalytics);

// Customer Interactions routes
router.get('/:id/interactions', customerController.getInteractions);
router.post('/:id/interactions', customerController.addInteraction);

export default router;
