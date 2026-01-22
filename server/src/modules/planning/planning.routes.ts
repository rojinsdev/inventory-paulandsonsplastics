import { Router } from 'express';
import { planningController } from './planning.controller';
import { authenticate } from '../../middleware/auth';


const router = Router();

// All planning endpoints require authentication
router.use(authenticate);


// GET endpoints
router.get('/demand-trends', planningController.getDemandTrends.bind(planningController));
router.get('/seasonal-patterns', planningController.getSeasonalPatterns.bind(planningController));
router.get('/recommendations', planningController.getRecommendations.bind(planningController));
router.get('/forecasts', planningController.getForecasts.bind(planningController));

// POST endpoints - Actions
router.post('/recommendations/:id/accept', planningController.acceptRecommendation.bind(planningController));
router.post('/recommendations/:id/reject', planningController.rejectRecommendation.bind(planningController));

// POST endpoints - Background jobs
router.post('/generate-recommendations', planningController.generateRecommendations.bind(planningController));
router.post('/detect-patterns', planningController.detectPatterns.bind(planningController));
router.post('/refresh-analytics', planningController.refreshAnalytics.bind(planningController));

export default router;
