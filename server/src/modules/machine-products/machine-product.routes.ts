import { Router } from 'express';
import { machineProductController } from './machine-product.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// READ routes - allow both admin and production_manager (for dropdowns/validation)
router.get('/', requireRole('admin', 'production_manager'), machineProductController.list);
router.get('/:id', requireRole('admin', 'production_manager'), machineProductController.get);

// WRITE routes - admin only
router.post('/', requireRole('admin'), machineProductController.create);
router.put('/:id', requireRole('admin'), machineProductController.update);
router.delete('/:id', requireRole('admin'), machineProductController.delete);

export default router;
