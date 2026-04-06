import { Router } from 'express';
import { machineCapController } from './machine-cap.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// READ routes - allow both admin and production_manager (for dropdowns/validation)
router.get('/', requireRole('admin', 'production_manager'), machineCapController.list);
router.get('/:id', requireRole('admin', 'production_manager'), machineCapController.get);

// WRITE routes - admin only
router.post('/', requireRole('admin'), machineCapController.create);
router.put('/:id', requireRole('admin'), machineCapController.update);
router.delete('/:id', requireRole('admin'), machineCapController.delete);

export default router;
