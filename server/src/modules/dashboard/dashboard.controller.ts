import { Request, Response } from 'express';
import { dashboardService } from './dashboard.service';

export class DashboardController {
    async getStats(req: Request, res: Response) {
        try {
            const factoryId = req.query.factory_id as string | undefined;
            const stats = await dashboardService.getStats(factoryId);
            return res.json(stats);
        } catch (error: any) {
            console.error('Error fetching dashboard stats:', error);
            return res.status(500).json({ error: error.message || 'Failed to fetch dashboard stats' });
        }
    }

    async getComprehensive(req: Request, res: Response) {
        try {
            const { startDate, endDate } = req.query;
            const data = await dashboardService.getComprehensiveData(
                startDate as string | undefined,
                endDate as string | undefined
            );
            return res.json(data);
        } catch (error: any) {
            console.error('Error fetching comprehensive dashboard data:', error);
            return res.status(500).json({ error: error.message || 'Failed to fetch comprehensive dashboard data' });
        }
    }
}

export const dashboardController = new DashboardController();
