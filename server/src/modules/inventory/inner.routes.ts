import { Router } from 'express';
import { innerController } from './inner.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// --- Template Routes ---
router.get('/templates', authenticate, innerController.listTemplates);
router.post('/templates', authenticate, innerController.createTemplate);
router.get('/templates/:id', authenticate, innerController.getTemplate);
router.patch('/templates/:id', authenticate, innerController.updateTemplate);
router.delete('/templates/:id', authenticate, innerController.deleteTemplate);

// --- Inner Variant Routes ---
router.get('/', authenticate, innerController.list);
router.post('/', authenticate, innerController.create);
router.get('/balances', authenticate, innerController.getBalances);
router.get('/:id', authenticate, innerController.getOne);
router.patch('/:id', authenticate, innerController.update);
router.delete('/:id', authenticate, innerController.delete);

export default router;
