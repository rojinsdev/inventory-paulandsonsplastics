import { Router } from 'express';
import { machineController } from './machine.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// READ routes - allow both admin and production_manager
router.get('/', requireRole('admin', 'production_manager'), machineController.list);
router.get('/:id', requireRole('admin', 'production_manager'), machineController.get);

// WRITE routes - admin only
router.post('/', requireRole('admin'), machineController.create);
router.put('/:id', requireRole('admin'), machineController.update);
router.delete('/:id', requireRole('admin'), machineController.delete);

export default router;
