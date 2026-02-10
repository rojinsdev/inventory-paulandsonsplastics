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

const submitCapProductionSchema = z.object({
    cap_id: z.string().uuid(),
    factory_id: z.string().uuid(),
    date: z.string(),
    shift_number: z.number().int().min(1).max(2),
    start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    total_weight_produced_kg: z.number().positive(),
    actual_cycle_time_seconds: z.number().positive(),
    remarks: z.string().optional(),
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
            const sanitize = (val: any) => (val === 'undefined' || val === 'null' ? undefined : val);

            const filters = {
                machine_id: sanitize(req.query.machine_id),
                product_id: sanitize(req.query.product_id),
                start_date: sanitize(req.query.start_date),
                end_date: sanitize(req.query.end_date),
                factory_id: sanitize(req.query.factory_id),
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

    async listRequests(req: Request, res: Response) {
        try {
            const factoryId = req.query.factory_id as string;
            const requests = await productionService.getProductionRequests(factoryId);
            res.json(requests);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async updateRequestStatus(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const { status } = req.body;

            if (!['pending', 'in-progress', 'completed', 'cancelled'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status' });
            }

            const request = await productionService.updateProductionRequestStatus(id, status, req.user!.id);
            res.json(request);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async submitCapProduction(req: AuthRequest, res: Response) {
        try {
            const validatedData = submitCapProductionSchema.parse(req.body);

            const log = await productionService.submitCapProduction({
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

    async listCapLogs(req: Request, res: Response) {
        try {
            const sanitize = (val: any) => (val === 'undefined' || val === 'null' ? undefined : val);

            const filters = {
                factory_id: sanitize(req.query.factory_id),
                cap_id: sanitize(req.query.cap_id),
                start_date: sanitize(req.query.start_date),
                end_date: sanitize(req.query.end_date),
            };
            const logs = await productionService.getCapProductionLogs(filters);
            res.json(logs);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getLastSession(req: Request, res: Response) {
        try {
            const { machine_id, date, shift_number } = req.query as any;
            if (!machine_id || !date || !shift_number) {
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            const endTime = await productionService.getLastSessionEndTime(
                machine_id,
                date,
                parseInt(shift_number)
            );
            res.json({ end_time: endTime });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const productionController = new ProductionController();
