import { Request, Response } from 'express';
import { productionService } from './production.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth';

// Updated schema for session-based production
const submitProductionSchema = z.object({
    date: z.string().optional(),
    machine_id: z.string().uuid(),
    product_id: z.string().uuid(),
    shift_number: z.union([z.literal(1), z.literal(2)]), // 1 or 2
    start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/), // HH:mm format
    end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),

    // For unit-count products
    total_produced: z.number().int().positive().optional(),
    damaged_count: z.number().int().nonnegative().optional(),

    // For weight-based products (caps)
    total_weight_kg: z.number().positive().optional(),

    // Actual metrics
    actual_cycle_time_seconds: z.number().positive(),
    actual_weight_grams: z.number().positive(),

    // Downtime
    downtime_minutes: z.number().int().optional(),
    downtime_reason: z.string().optional(),
});

export class ProductionController {
    async submit(req: AuthRequest, res: Response) {
        try {
            const validatedData = submitProductionSchema.parse(req.body);

            const log = await productionService.submitProduction({
                ...validatedData,
                user_id: req.user!.id,
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
