import { Router } from 'express';
import { supplierController } from './supplier.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// All supplier routes require authentication
router.use(authenticate);

router.get('/', asyncHandler(supplierController.list));
router.get('/:id', asyncHandler(supplierController.get));

// Modification routes require admin role
router.post('/', requireRole('admin'), asyncHandler(supplierController.create));
router.patch('/:id', requireRole('admin'), asyncHandler(supplierController.update));
router.delete('/:id', requireRole('admin'), asyncHandler(supplierController.delete));

export default router;
