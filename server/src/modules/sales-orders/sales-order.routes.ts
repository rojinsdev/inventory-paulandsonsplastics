import { Router } from 'express';
import { salesOrderController } from './sales-order.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// All sales order endpoints require authentication
router.use(authenticate);

// Creation and Management (Admin Only)
router.post('/', requireRole('admin'), asyncHandler(salesOrderController.create));
router.get('/', requireRole('admin', 'production_manager'), asyncHandler(salesOrderController.list));

// Payment History and Tracking (MUST come before /:id route)
router.get('/customers/:customerId/payment-history', requireRole('admin'), asyncHandler(salesOrderController.getCustomerPaymentHistory));
router.get('/pending-payments', requireRole('admin'), asyncHandler(salesOrderController.getPendingPayments));

// Overdue Payment Detection (MUST come before /:id route)
router.post('/check-overdue', requireRole('admin'), asyncHandler(salesOrderController.checkOverdue));

// Single order operations (/:id MUST come after all specific routes)
router.get('/:id', asyncHandler(salesOrderController.get));
router.patch('/:id/status', requireRole('admin'), asyncHandler(salesOrderController.updateStatus));
router.put('/:id/deliver', requireRole('admin'), asyncHandler(salesOrderController.deliver));
router.put('/:id/cancel', requireRole('admin'), asyncHandler(salesOrderController.cancel));
router.delete('/:id', requireRole('admin'), asyncHandler(salesOrderController.delete));

// Item Preparation (Admin or Production Manager)
router.put('/items/:itemId/prepare', requireRole('admin', 'production_manager'), asyncHandler(salesOrderController.prepareItem));

// Payment Processing (Admin Only)
router.post('/:id/process-delivery', requireRole('admin'), asyncHandler(salesOrderController.processDelivery));
router.post('/:id/record-payment', requireRole('admin'), asyncHandler(salesOrderController.recordPayment));


export default router;

