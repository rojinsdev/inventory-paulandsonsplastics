import { Router } from 'express';
import { inventoryController } from './inventory.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// Inventory endpoints accessible by both admin (web) and production_manager (mobile)
router.use(authenticate, requireRole('admin', 'production_manager'));

router.post('/pack', inventoryController.pack);
router.post('/bundle', inventoryController.bundle);
router.get('/stock/:id', inventoryController.getStock);
router.get('/stock', inventoryController.listAll);

// Raw Materials
router.get('/raw-materials', inventoryController.getRawMaterials);
router.post('/raw-materials', requireRole('admin'), inventoryController.createRawMaterial);
router.post('/raw-materials/:id/adjust', inventoryController.adjustRawMaterial);

export default router;

