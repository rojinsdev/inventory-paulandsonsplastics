import { Router } from 'express';
import { salesOrderController } from './sales-order.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All sales order endpoints require admin role (Web only)
router.use(authenticate, requireRole('admin'));

router.post('/', salesOrderController.create);
router.get('/', salesOrderController.list);
router.get('/:id', salesOrderController.get);
router.patch('/:id/status', salesOrderController.updateStatus);
router.put('/:id/deliver', salesOrderController.deliver);
router.put('/:id/cancel', salesOrderController.cancel);
router.delete('/:id', salesOrderController.delete);

export default router;
