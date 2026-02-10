import { Request, Response } from 'express';
import { reportsService } from './reports.service';

export class ReportsController {
    async getInventoryReport(req: Request, res: Response) {
        try {
            const sanitize = (val: any) => (val === 'undefined' || val === 'null' ? undefined : val);
            const { from, to, factory_id } = req.query;

            const report = await reportsService.getInventoryReport({
                from: sanitize(from),
                to: sanitize(to),
                factory_id: sanitize(factory_id)
            });
            res.json(report);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getSalesReport(req: Request, res: Response) {
        try {
            const sanitize = (val: any) => (val === 'undefined' || val === 'null' ? undefined : val);
            const { from, to, factory_id } = req.query;

            const report = await reportsService.getSalesReport({
                from: sanitize(from),
                to: sanitize(to),
                factory_id: sanitize(factory_id)
            });
            res.json(report);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const reportsController = new ReportsController();
