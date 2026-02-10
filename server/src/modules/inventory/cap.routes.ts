import { Router } from 'express';
import { capController } from './cap.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// GET /caps - List all caps (with optional factory_id filter)
router.get('/',
    authenticate,
    capController.list
);

// GET /caps/balances - Get stock balances for caps
router.get('/balances',
    authenticate,
    capController.getBalances
);

// GET /caps/:id - Get single cap details
router.get('/:id',
    authenticate,
    capController.getOne
);

// Admin only operations
router.post('/',
    authenticate,
    requireRole('admin'),
    capController.create
);

router.put('/:id',
    authenticate,
    requireRole('admin'),
    capController.update
);

router.delete('/:id',
    authenticate,
    requireRole('admin'),
    capController.delete
);

export default router;
