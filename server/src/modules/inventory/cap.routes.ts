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

// GET /caps/templates - Get cap templates
router.get('/templates',
    authenticate,
    capController.listTemplates
);

// GET /caps/templates/:id - Get single cap template
router.get('/templates/:id',
    authenticate,
    capController.getTemplate
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

router.post('/templates',
    authenticate,
    requireRole('admin'),
    capController.createTemplate
);

router.put('/templates/:id',
    authenticate,
    requireRole('admin'),
    capController.updateTemplate
);

router.delete('/templates/:id',
    authenticate,
    requireRole('admin'),
    capController.deleteTemplate
);

router.delete('/:id',
    authenticate,
    requireRole('admin'),
    capController.delete
);

export default router;
