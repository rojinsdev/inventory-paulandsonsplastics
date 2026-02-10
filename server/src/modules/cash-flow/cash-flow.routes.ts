import { Router } from 'express';
import { cashFlowController } from './cash-flow.controller';

const router = Router();

router.get('/daily', (req, res) => cashFlowController.getDailySheet(req, res));
router.get('/analytics', (req, res) => cashFlowController.getMonthlyAnalytics(req, res));
router.post('/entry', (req, res) => cashFlowController.logManualEntry(req, res));
router.get('/categories', (req, res) => cashFlowController.getCategories(req, res));
router.post('/categories', (req, res) => cashFlowController.createCategory(req, res));
router.put('/categories/:id', (req, res) => cashFlowController.updateCategory(req, res));
router.delete('/categories/:id', (req, res) => cashFlowController.deleteCategory(req, res));

export default router;
