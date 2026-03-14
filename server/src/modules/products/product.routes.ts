import { Router } from 'express';
import { productController } from './product.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// READ routes - allow both admin and production_manager
router.get('/', requireRole('admin', 'production_manager'), productController.list);
router.get('/templates', requireRole('admin', 'production_manager'), productController.listTemplates);
router.get('/templates/:id', requireRole('admin', 'production_manager'), productController.getTemplate);
router.get('/:id', requireRole('admin', 'production_manager'), productController.get);

// WRITE routes - admin only
router.post('/', requireRole('admin'), productController.create);
router.post('/templates', requireRole('admin'), productController.createTemplate);
router.put('/templates/:id', requireRole('admin'), productController.updateTemplate);
router.put('/:id', requireRole('admin'), productController.update);
router.delete('/:id', requireRole('admin'), productController.delete);

export default router;
