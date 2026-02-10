import { Request, Response } from 'express';
import { cashFlowService } from './cash-flow.service';

export class CashFlowController {
    async getDailySheet(req: Request, res: Response) {
        try {
            const { date, factory_id } = req.query;
            const data = await cashFlowService.getDailySheet(date as string, factory_id as string);
            res.json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getMonthlyAnalytics(req: Request, res: Response) {
        try {
            const { month, year, date, factory_id } = req.query;
            const data = await cashFlowService.getPeriodAnalytics({
                month: month ? Number(month) : undefined,
                year: year ? Number(year) : undefined,
                date: date as string,
                factoryId: factory_id as string
            });
            res.json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async logManualEntry(req: Request, res: Response) {
        try {
            const data = req.body;
            await cashFlowService.logEntry({
                ...data,
                is_automatic: false
            });
            res.status(201).json({ message: 'Entry logged successfully' });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getCategories(req: Request, res: Response) {
        try {
            const data = await cashFlowService.getCategories();
            res.json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async createCategory(req: Request, res: Response) {
        try {
            const category = await cashFlowService.createCategory(req.body);
            res.status(201).json(category);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async updateCategory(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const category = await cashFlowService.updateCategory(id, req.body);
            res.json(category);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async deleteCategory(req: Request, res: Response) {
        try {
            const { id } = req.params;
            await cashFlowService.deleteCategory(id);
            res.json({ message: 'Category deleted successfully' });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const cashFlowController = new CashFlowController();
