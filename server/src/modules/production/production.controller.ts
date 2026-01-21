import { Request, Response } from 'express';
import { productionService } from './production.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth';

const submitProductionSchema = z.object({
    date: z.string().optional(),
    machine_id: z.string().uuid(),
    product_id: z.string().uuid(),
    actual_quantity: z.number().int().positive(), // Changed: Must be > 0, not >= 0
    waste_weight_grams: z.number().nonnegative().optional(),
});

export class ProductionController {
    async submit(req: AuthRequest, res: Response) {
        try {
            const validatedData = submitProductionSchema.parse(req.body);

            // Pass user_id from authenticated request
            const log = await productionService.submitProduction({
                ...validatedData,
                user_id: req.user!.id, // User is guaranteed by authenticate middleware
            });

            res.status(201).json(log);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async list(req: Request, res: Response) {
        try {
            const filters = {
                machine_id: req.query.machine_id as string,
                product_id: req.query.product_id as string,
                start_date: req.query.start_date as string,
                end_date: req.query.end_date as string,
            };
            const logs = await productionService.getProductionLogs(filters);
            res.json(logs);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getDailyProduction(req: Request, res: Response) {
        try {
            const { date } = req.params;
            const logs = await productionService.getDailyProduction(date);
            res.json(logs);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const productionController = new ProductionController();
