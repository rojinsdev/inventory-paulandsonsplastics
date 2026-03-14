import { Router } from 'express';
import { inventoryController } from './inventory.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// Pack/Bundle - Production Manager only (factory floor operations)
router.post('/pack',
    authenticate,
    requireRole('production_manager'),
    asyncHandler(inventoryController.pack)
);
router.post('/bundle',
    authenticate,
    requireRole('production_manager'),
    asyncHandler(inventoryController.bundle)
);
router.post('/unpack',
    authenticate,
    requireRole('admin', 'production_manager'),
    asyncHandler(inventoryController.unpack)
);


// GET routes - Both roles can view
router.get('/stock/:id',
    authenticate,
    requireRole('admin', 'production_manager'),
    asyncHandler(inventoryController.getStock)
);
router.get('/stock',
    authenticate,
    requireRole('admin', 'production_manager'),
    asyncHandler(inventoryController.listAll)
);
router.get('/overview',
    authenticate,
    requireRole('admin', 'production_manager'),
    asyncHandler(inventoryController.getStockOverview)
);
router.get('/available',
    authenticate,
    requireRole('admin', 'production_manager'),
    asyncHandler(inventoryController.getAvailable)
);

// Raw Materials
router.get('/raw-materials',
    authenticate,
    requireRole('admin', 'production_manager'),
    asyncHandler(inventoryController.getRawMaterials)
);
router.post('/raw-materials',
    authenticate,
    requireRole('admin'),
    asyncHandler(inventoryController.createRawMaterial)
);
router.put('/raw-materials/:id',
    authenticate,
    requireRole('admin'),
    asyncHandler(inventoryController.updateRawMaterial)
);
router.post('/raw-materials/:id/adjust',
    authenticate,
    requireRole('admin', 'production_manager'),
    asyncHandler(inventoryController.adjustRawMaterial)
);


export default router;
