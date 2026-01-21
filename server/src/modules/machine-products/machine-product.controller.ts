import { Request, Response } from 'express';
import { machineProductService } from './machine-product.service';
import { z } from 'zod';

const createMappingSchema = z.object({
    machine_id: z.string().uuid(),
    product_id: z.string().uuid(),
    cycle_time_seconds: z.number().positive(),
    capacity_restriction: z.number().nullable().optional(),
    enabled: z.boolean().optional(),
});

export class MachineProductController {
    async create(req: Request, res: Response) {
        try {
            const validatedData = createMappingSchema.parse(req.body);
            const mapping = await machineProductService.createMapping(validatedData);
            res.status(201).json(mapping);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
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
            const { machine_id, product_id } = req.query;

            let mappings;
            if (machine_id) {
                mappings = await machineProductService.getMappingsByMachine(machine_id as string);
            } else if (product_id) {
                mappings = await machineProductService.getMappingsByProduct(product_id as string);
            } else {
                mappings = await machineProductService.getAllMappings();
            }

            res.json(mappings);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async get(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const mapping = await machineProductService.getMappingById(id);
            res.json(mapping);
        } catch (error: any) {
            res.status(404).json({ error: 'Mapping not found' });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const validatedData = createMappingSchema.partial().parse(req.body);
            const mapping = await machineProductService.updateMapping(id, validatedData);
            res.json(mapping);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else if (error.message.includes('not found')) {
                res.status(404).json({ error: 'Mapping not found' });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const result = await machineProductService.deleteMapping(id);
            res.json(result);
        } catch (error: any) {
            if (error.message.includes('foreign key')) {
                res.status(409).json({ error: 'Cannot delete mapping used in production history' });
            } else {
                res.status(404).json({ error: 'Mapping not found' });
            }
        }
    }
}

export const machineProductController = new MachineProductController();
