import { Request, Response } from 'express';
import { productionService } from './production.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth';
import { resolveAuthorizedFactoryId } from '../../utils/auth';
import { AppError } from '../../utils/AppError';

// Updated schema for session-based production
const submitProductionSchema = z.object({
    date: z.string().optional(),
    machine_id: z.string().uuid(),
    product_id: z.string().uuid(),
    shift_number: z.union([z.literal(1), z.literal(2)]), // 1 or 2
    start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/), // HH:mm format
    end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),

    // For unit-count products
    total_produced: z.number().int().nonnegative().optional(),
    damaged_count: z.number().int().nonnegative().optional(),

    // For weight-based products (caps)
    total_weight_kg: z.number().nonnegative().optional(),

    // Actual metrics
    actual_cycle_time_seconds: z.number().nonnegative().optional(),
    actual_weight_grams: z.number().nonnegative().optional(),

    // Downtime
    downtime_minutes: z.number().int().optional(),
    downtime_reason: z.string().optional(),
});

const submitCapProductionSchema = z.object({
    cap_id: z.string().uuid(),
    machine_id: z.string().uuid(),
    factory_id: z.string().uuid().optional(),
    date: z.string(),
    shift_number: z.number().int().min(1).max(2),
    start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    total_weight_produced_kg: z.number().nonnegative().optional(),
    total_produced: z.number().int().nonnegative().optional(),
    actual_cycle_time_seconds: z.number().nonnegative().optional(),
    actual_weight_grams: z.number().nonnegative().optional(),
    downtime_minutes: z.number().int().nonnegative().optional(),
    downtime_reason: z.string().optional(),
    remarks: z.string().optional(),
});

const submitInnerProductionSchema = z.object({
    inner_id: z.string().uuid(),
    machine_id: z.string().uuid(),
    factory_id: z.string().uuid().optional(),
    date: z.string(),
    shift_number: z.number().int().min(1).max(2),
    start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    total_weight_produced_kg: z.number().nonnegative().optional(),
    total_produced: z.number().int().nonnegative().optional(),
    actual_cycle_time_seconds: z.number().nonnegative().optional(),
    actual_weight_grams: z.number().nonnegative().optional(),
    downtime_minutes: z.number().int().nonnegative().optional(),
    downtime_reason: z.string().optional(),
    remarks: z.string().optional(),
});


export class ProductionController {
    async submit(req: AuthRequest, res: Response) {
        console.log('Production Submit Request:', JSON.stringify(req.body, null, 2));
        const validatedData = submitProductionSchema.parse(req.body);

        const log = await productionService.submitProduction({
            ...validatedData,
            user_id: req.user!.id,
        });

        res.status(201).json(log);
    }

    async list(req: AuthRequest, res: Response) {
        const sanitize = (val: any) => (val === 'undefined' || val === 'null' ? undefined : val);
        const resolvedFactoryId = resolveAuthorizedFactoryId(req);

        const filters = {
            machine_id: sanitize(req.query.machine_id),
            product_id: sanitize(req.query.product_id),
            start_date: sanitize(req.query.start_date),
            end_date: sanitize(req.query.end_date),
            factory_id: resolvedFactoryId || sanitize(req.query.factory_id),
            page: req.query.page ? parseInt(req.query.page as string) : 1,
            size: req.query.size ? parseInt(req.query.size as string) : 20,
        };
        const result = await productionService.getProductionLogs(filters);
        res.json(result);
    }

    async getDailyProduction(req: Request, res: Response) {
        const { date } = req.params;
        const logs = await productionService.getDailyProduction(date);
        res.json(logs);
    }

    async listRequests(req: AuthRequest, res: Response) {
        try {
            const factoryId = resolveAuthorizedFactoryId(req);
            const requests = await productionService.getProductionRequests(factoryId);
            res.json(requests);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async updateRequestStatus(req: AuthRequest, res: Response) {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'in_production', 'completed', 'prepared', 'cancelled'].includes(status)) {
            throw new AppError('Invalid status', 400);
        }

        const request = await productionService.updateProductionRequestStatus(id, status, req.user!.id);
        res.json(request);
    }

    async submitCapProduction(req: AuthRequest, res: Response) {
        const validatedData = submitCapProductionSchema.parse(req.body);

        const log = await productionService.submitCapProduction({
            ...validatedData,
            user_id: req.user!.id,
        });

        res.status(201).json(log);
    }

    async listCapLogs(req: AuthRequest, res: Response) {
        const sanitize = (val: any) => (val === 'undefined' || val === 'null' ? undefined : val);
        const resolvedFactoryId = resolveAuthorizedFactoryId(req);

        const filters = {
            factory_id: resolvedFactoryId || sanitize(req.query.factory_id),
            cap_id: sanitize(req.query.cap_id),
            start_date: sanitize(req.query.start_date),
            end_date: sanitize(req.query.end_date),
            page: req.query.page ? parseInt(req.query.page as string) : 1,
            size: req.query.size ? parseInt(req.query.size as string) : 20,
        };
        const result = await productionService.getCapProductionLogs(filters);
        res.json(result);
    }

    async getLastSession(req: Request, res: Response) {
        const { machine_id, date, shift_number } = req.query as any;
        if (!machine_id || !date || !shift_number) {
            throw new AppError('Missing required parameters', 400);
        }

        const endTime = await productionService.getLastSessionEndTime(
            machine_id,
            date,
            parseInt(shift_number)
        );
        res.json({ end_time: endTime });
    }

    async submitInnerProduction(req: AuthRequest, res: Response) {
        const validatedData = submitInnerProductionSchema.parse(req.body);

        const log = await productionService.submitInnerProduction({
            ...validatedData,
            user_id: req.user!.id,
        });

        res.status(201).json(log);
    }

    async listInnerLogs(req: AuthRequest, res: Response) {
        const sanitize = (val: any) => (val === 'undefined' || val === 'null' ? undefined : val);
        const resolvedFactoryId = resolveAuthorizedFactoryId(req);

        const filters = {
            factory_id: resolvedFactoryId || sanitize(req.query.factory_id),
            inner_id: sanitize(req.query.inner_id),
            start_date: sanitize(req.query.start_date),
            end_date: sanitize(req.query.end_date),
            page: req.query.page ? parseInt(req.query.page as string) : 1,
            size: req.query.size ? parseInt(req.query.size as string) : 20,
        };
        const result = await productionService.getInnerProductionLogs(filters);
        res.json(result);
    }
}


export const productionController = new ProductionController();
