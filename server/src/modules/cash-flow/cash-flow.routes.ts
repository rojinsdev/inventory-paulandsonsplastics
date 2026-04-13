import { Router } from 'express';
import { cashFlowController } from './cash-flow.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

router.use(authenticate);
router.use(requireRole('admin'));

router.get('/daily', (req, res) => cashFlowController.getDailySheet(req, res));
router.get('/analytics', (req, res) => cashFlowController.getMonthlyAnalytics(req, res));
router.get('/balances', (req, res) => cashFlowController.getBalances(req, res));
router.post('/entry', (req, res) => cashFlowController.logManualEntry(req, res));
router.post('/transfer', (req, res) => cashFlowController.logTransfer(req, res));
router.get('/categories', (req, res) => cashFlowController.getCategories(req, res));
router.post('/categories', (req, res) => cashFlowController.createCategory(req, res));
router.put('/categories/:id', (req, res) => cashFlowController.updateCategory(req, res));
router.delete('/categories/:id', (req, res) => cashFlowController.deleteCategory(req, res));

export default router;
