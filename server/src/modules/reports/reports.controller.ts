import { Request, Response } from 'express';
import { reportsService } from './reports.service';

export class ReportsController {
    async getInventoryReport(req: Request, res: Response) {
        try {
            const { from, to } = req.query;
            const report = await reportsService.getInventoryReport({
                from: from as string,
                to: to as string
            });
            res.json(report);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getSalesReport(req: Request, res: Response) {
        try {
            const { from, to } = req.query;
            const report = await reportsService.getSalesReport({
                from: from as string,
                to: to as string
            });
            res.json(report);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const reportsController = new ReportsController();
