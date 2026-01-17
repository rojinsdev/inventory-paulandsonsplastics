import { Router } from 'express';
import { customerController } from './customer.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All customer endpoints require admin role (Web only)
router.use(authenticate, requireRole('admin'));

router.post('/', customerController.create);
router.get('/', customerController.list);
router.get('/:id', customerController.get);
router.put('/:id', customerController.update);
router.delete('/:id', customerController.delete);

export default router;
