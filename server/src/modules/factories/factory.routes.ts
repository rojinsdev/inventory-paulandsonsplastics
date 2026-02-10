import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { factoryController } from './factory.controller';

const router = Router();

// All factory endpoints require admin role
router.use(authenticate, requireRole('admin'));

// Factory CRUD
router.get('/', factoryController.list);
router.get('/:id', factoryController.get);
router.get('/:id/stats', factoryController.getStats);
router.post('/', factoryController.create);
router.put('/:id', factoryController.update);
router.patch('/:id/toggle', factoryController.toggleStatus);
router.delete('/:id', factoryController.delete);

export default router;
