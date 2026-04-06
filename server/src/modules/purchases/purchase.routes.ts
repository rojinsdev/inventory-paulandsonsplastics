import { Router } from 'express';
import { purchaseController } from './purchase.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// All purchase routes require authentication
router.use(authenticate);

router.get('/', asyncHandler(purchaseController.list));
router.get('/payments', asyncHandler(purchaseController.getPayments));
router.get('/:id', asyncHandler(purchaseController.get));

// Recording purchases and payments require admin role
router.post('/', requireRole('admin'), asyncHandler(purchaseController.create));
router.post('/payments', requireRole('admin'), asyncHandler(purchaseController.recordPayment));

export default router;
