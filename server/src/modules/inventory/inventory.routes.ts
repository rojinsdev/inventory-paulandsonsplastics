import { Router } from 'express';
import { inventoryController } from './inventory.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All inventory endpoints require production_manager role (Mobile only)
router.use(authenticate, requireRole('production_manager'));

router.post('/pack', inventoryController.pack);
router.post('/bundle', inventoryController.bundle);
router.get('/stock/:id', inventoryController.getStock);
router.get('/stock', inventoryController.listAll);

export default router;
