import { Request, Response } from 'express';
import { analyticsService } from './analytics.service';

export class AnalyticsController {
    async getCycleTimeLoss(req: Request, res: Response) {
        try {
            const filters = {
                start_date: req.query.start_date as string,
                end_date: req.query.end_date as string,
                machine_id: req.query.machine_id as string,
                flagged_only: req.query.flagged_only === 'true',
                factory_id: req.query.factory_id as string,
            };
            const data = await analyticsService.getCycleTimeLossAnalysis(filters);
            res.json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getWeightWastage(req: Request, res: Response) {
        try {
            const filters = {
                start_date: req.query.start_date as string,
                end_date: req.query.end_date as string,
                product_id: req.query.product_id as string,
                factory_id: req.query.factory_id as string,
            };
            const data = await analyticsService.getWeightWastageReport(filters);
            res.json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getDowntimeBreakdown(req: Request, res: Response) {
        try {
            const filters = {
                start_date: req.query.start_date as string,
                end_date: req.query.end_date as string,
                machine_id: req.query.machine_id as string,
                factory_id: req.query.factory_id as string,
            };
            const data = await analyticsService.getDowntimeBreakdown(filters);
            res.json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getMachineEfficiency(req: Request, res: Response) {
        try {
            const filters = {
                start_date: req.query.start_date as string,
                end_date: req.query.end_date as string,
                machine_id: req.query.machine_id as string,
                factory_id: req.query.factory_id as string,
            };
            const data = await analyticsService.getMachineEfficiencyTrends(filters);
            res.json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getShiftComparison(req: Request, res: Response) {
        try {
            const filters = {
                start_date: req.query.start_date as string,
                end_date: req.query.end_date as string,
                factory_id: req.query.factory_id as string,
            };
            const data = await analyticsService.getShiftComparison(filters);
            res.json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getDashboardSummary(req: Request, res: Response) {
        try {
            const filters = {
                start_date: req.query.start_date as string,
                end_date: req.query.end_date as string,
                factory_id: req.query.factory_id as string,
            };
            const data = await analyticsService.getDashboardSummary(filters);
            res.json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const analyticsController = new AnalyticsController();
