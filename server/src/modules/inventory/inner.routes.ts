import { Router } from 'express';
import { innerController } from './inner.controller';
import { authenticate } from '../../middleware/auth';

import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

// --- Template Routes ---
router.get('/templates', authenticate, asyncHandler(innerController.listTemplates));
router.post('/templates', authenticate, asyncHandler(innerController.createTemplate));
router.get('/templates/:id', authenticate, asyncHandler(innerController.getTemplate));
router.patch('/templates/:id', authenticate, asyncHandler(innerController.updateTemplate));
router.delete('/templates/:id', authenticate, asyncHandler(innerController.deleteTemplate));

// --- Inner Variant Routes ---
router.get('/balances', authenticate, asyncHandler(innerController.getBalances));
router.get('/', authenticate, asyncHandler(innerController.list));
router.post('/', authenticate, asyncHandler(innerController.create));
router.get('/:id', authenticate, asyncHandler(innerController.getOne));
router.patch('/:id', authenticate, asyncHandler(innerController.update));
router.delete('/:id', authenticate, asyncHandler(innerController.delete));

export default router;
