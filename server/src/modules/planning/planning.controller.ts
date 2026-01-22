import { Request, Response } from 'express';
import { planningService } from './planning.service';

export class PlanningController {
    /**
     * GET /api/planning/demand-trends
     * Get demand trends for products
     */
    async getDemandTrends(req: Request, res: Response) {
        try {
            const filters = {
                period: req.query.period as any,
                start_date: req.query.start_date as string,
                end_date: req.query.end_date as string,
                product_id: req.query.product_id as string,
            };

            const data = await planningService.getDemandTrends(filters);
            res.json(data);
        } catch (error: any) {
            console.error('Error in getDemandTrends:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /api/planning/seasonal-patterns
     * Get detected seasonal patterns
     */
    async getSeasonalPatterns(req: Request, res: Response) {
        try {
            const filters = {
                product_id: req.query.product_id as string,
                confidence_min: req.query.confidence_min ? Number(req.query.confidence_min) : undefined,
                is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
            };

            const data = await planningService.getSeasonalPatterns(filters);
            res.json(data);
        } catch (error: any) {
            console.error('Error in getSeasonalPatterns:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /api/planning/recommendations
     * Get production recommendations
     */
    async getRecommendations(req: Request, res: Response) {
        try {
            const filters = {
                target_month: req.query.target_month as string,
                status: req.query.status as any,
                product_id: req.query.product_id as string,
                confidence_min: req.query.confidence_min ? Number(req.query.confidence_min) : undefined,
            };

            const data = await planningService.getRecommendations(filters);
            res.json(data);
        } catch (error: any) {
            console.error('Error in getRecommendations:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /api/planning/forecasts
     * Get demand forecasts
     */
    async getForecasts(req: Request, res: Response) {
        try {
            const filters = {
                product_id: req.query.product_id as string,
                forecast_method: req.query.forecast_method as 'SMA' | 'WMA' | 'seasonal' | 'hybrid' | undefined,
                start_date: req.query.start_date as string,
                end_date: req.query.end_date as string,
            };

            const data = await planningService.getForecasts(filters);
            res.json(data);
        } catch (error: any) {
            console.error('Error in getForecasts:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * POST /api/planning/recommendations/:id/accept
     * Accept a recommendation
     */
    async acceptRecommendation(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { adjusted_quantity } = req.body;
            const userId = (req as any).user?.id;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            await planningService.acceptRecommendation(id, userId, adjusted_quantity);
            res.json({ success: true, message: 'Recommendation accepted' });
        } catch (error: any) {
            console.error('Error in acceptRecommendation:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * POST /api/planning/recommendations/:id/reject
     * Reject a recommendation
     */
    async rejectRecommendation(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { rejection_reason } = req.body;
            const userId = (req as any).user?.id;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            await planningService.rejectRecommendation(id, userId, rejection_reason);
            res.json({ success: true, message: 'Recommendation rejected' });
        } catch (error: any) {
            console.error('Error in rejectRecommendation:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * POST /api/planning/generate-recommendations
     * Generate recommendations for a target month
     */
    async generateRecommendations(req: Request, res: Response) {
        try {
            const { target_month } = req.body;

            if (!target_month) {
                return res.status(400).json({ error: 'target_month is required (YYYY-MM format)' });
            }

            // Run in background
            planningService.generateRecommendations(target_month).catch(err => {
                console.error('Background recommendation generation failed:', err);
            });

            res.json({ success: true, message: 'Recommendation generation started' });
        } catch (error: any) {
            console.error('Error in generateRecommendations:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * POST /api/planning/detect-patterns
     * Detect seasonal patterns
     */
    async detectPatterns(req: Request, res: Response) {
        try {
            const { years_back } = req.body;

            // Run in background
            planningService.detectSeasonalPatterns(years_back || 3).catch(err => {
                console.error('Background pattern detection failed:', err);
            });

            res.json({ success: true, message: 'Pattern detection started' });
        } catch (error: any) {
            console.error('Error in detectPatterns:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * POST /api/planning/refresh-analytics
     * Refresh all analytics (patterns + recommendations)
     */
    async refreshAnalytics(req: Request, res: Response) {
        try {
            const { target_month, years_back } = req.body;

            // Run both in background
            Promise.all([
                planningService.detectSeasonalPatterns(years_back || 3),
                planningService.generateRecommendations(target_month || new Date().toISOString().substring(0, 7)),
            ]).catch(err => {
                console.error('Background analytics refresh failed:', err);
            });

            res.json({ success: true, message: 'Analytics refresh started' });
        } catch (error: any) {
            console.error('Error in refreshAnalytics:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

export const planningController = new PlanningController();
