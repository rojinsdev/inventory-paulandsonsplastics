import { Request, Response } from 'express';
import { factoryService } from './factory.service';
import { z } from 'zod';

const createFactorySchema = z.object({
    name: z.string().min(1, 'Factory name is required'),
    code: z.string().min(1, 'Factory code is required').regex(/^[A-Z0-9_]+$/, 'Factory code must be uppercase letters, numbers, and underscores only'),
    location: z.string().optional(),
    contact_person: z.string().optional(),
    contact_phone: z.string().optional(),
    contact_email: z.string().email('Invalid email').optional().or(z.literal('')),
    machine_count: z.number().min(0).optional(),
});

const updateFactorySchema = z.object({
    name: z.string().min(1).optional(),
    code: z.string().min(1).optional().transform(v => v?.toUpperCase()),
    location: z.string().optional(),
    contact_person: z.string().optional(),
    contact_phone: z.string().optional(),
    contact_email: z.string().email('Invalid email').optional().or(z.literal('')),
    machine_count: z.number().min(0).optional(),
});

export class FactoryController {
    async create(req: Request, res: Response) {
        try {
            const validatedData = createFactorySchema.parse(req.body);
            const factory = await factoryService.createFactory(validatedData);
            res.status(201).json(factory);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                console.error('Factory Validation Error:', JSON.stringify(error.issues, null, 2));
                res.status(400).json({ error: error.issues });
            } else if (error.message.includes('already exists')) {
                res.status(409).json({ error: error.message });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async list(req: Request, res: Response) {
        try {
            const includeInactive = req.query.include_inactive === 'true';
            const factories = await factoryService.getAllFactories(includeInactive);
            res.json(factories);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async get(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const factory = await factoryService.getFactoryById(id);
            res.json(factory);
        } catch (error: any) {
            res.status(404).json({ error: 'Factory not found' });
        }
    }

    async getStats(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const stats = await factoryService.getFactoryStats(id);
            res.json(stats);
        } catch (error: any) {
            res.status(404).json({ error: 'Factory not found' });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const validatedData = updateFactorySchema.parse(req.body);
            const factory = await factoryService.updateFactory(id, validatedData);
            res.json(factory);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else if (error.message.includes('not found')) {
                res.status(404).json({ error: 'Factory not found' });
            } else if (error.message.includes('duplicate key') || error.message.includes('already exists')) {
                res.status(409).json({ error: 'Factory name or code already exists' });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async toggleStatus(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { active } = req.body;

            if (typeof active !== 'boolean') {
                return res.status(400).json({ error: 'Active status must be a boolean' });
            }

            const factory = await factoryService.toggleFactoryStatus(id, active);
            res.json(factory);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const result = await factoryService.deleteFactory(id);
            res.json(result);
        } catch (error: any) {
            if (error.message.includes('Cannot delete')) {
                res.status(409).json({ error: error.message });
            } else {
                res.status(404).json({ error: 'Factory not found' });
            }
        }
    }
}

export const factoryController = new FactoryController();
