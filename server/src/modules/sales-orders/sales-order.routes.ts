import { Router } from 'express';
import { salesOrderController } from './sales-order.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All sales order endpoints require authentication
router.use(authenticate);

// Creation and Management (Admin Only)
router.post('/', requireRole('admin'), salesOrderController.create);
router.get('/', requireRole('admin', 'production_manager'), salesOrderController.list);
router.get('/:id', salesOrderController.get);
router.patch('/:id/status', requireRole('admin'), salesOrderController.updateStatus);
router.put('/:id/deliver', requireRole('admin'), salesOrderController.deliver);
router.put('/:id/cancel', requireRole('admin'), salesOrderController.cancel);
router.delete('/:id', requireRole('admin'), salesOrderController.delete);

// Item Preparation (Admin or Production Manager)
router.put('/items/:itemId/prepare', requireRole('admin', 'production_manager'), salesOrderController.prepareItem);

// Payment Processing (Admin Only)
router.post('/:id/process-delivery', requireRole('admin'), salesOrderController.processDelivery);
router.post('/:id/record-payment', requireRole('admin'), salesOrderController.recordPayment);

// Payment History and Tracking
router.get('/customers/:customerId/payment-history', requireRole('admin'), salesOrderController.getCustomerPaymentHistory);
router.get('/pending-payments', requireRole('admin'), salesOrderController.getPendingPayments);

// Overdue Payment Detection
router.post('/check-overdue', requireRole('admin'), salesOrderController.checkOverdue);

export default router;

