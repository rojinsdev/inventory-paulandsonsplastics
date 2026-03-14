import { Router } from 'express';
import { customerController } from './customer.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// All customer endpoints require admin role (Web only)
router.use(authenticate, requireRole('admin'));

// Customer Segmentation routes (must be before /:id to avoid conflicts)
router.get('/segments/:segment', asyncHandler(customerController.getBySegment));
router.get('/vip/list', asyncHandler(customerController.getVIP));
router.get('/at-risk/list', asyncHandler(customerController.getAtRisk));
router.get('/stats/overview', asyncHandler(customerController.getStats));

// Basic CRUD routes
router.post('/', asyncHandler(customerController.create));
router.get('/', asyncHandler(customerController.list));
router.get('/:id', asyncHandler(customerController.get));
router.get('/:id/profile', asyncHandler(customerController.getProfile));
router.get('/:id/purchase-history', asyncHandler(customerController.getPurchaseHistory));
router.get('/:id/analytics', asyncHandler(customerController.getAnalytics));
router.get('/:id/interactions', asyncHandler(customerController.getInteractions));
router.post('/:id/interactions', asyncHandler(customerController.addInteraction));
router.put('/:id', asyncHandler(customerController.update));
router.delete('/:id', asyncHandler(customerController.delete));

export default router;
