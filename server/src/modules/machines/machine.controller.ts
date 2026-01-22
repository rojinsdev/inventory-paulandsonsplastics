import { Request, Response } from 'express';
import { machineService } from './machine.service';
import { z } from 'zod';

const createMachineSchema = z.object({
    name: z.string().min(1),
    type: z.enum(['extruder', 'cutting', 'printing', 'packing']),
    category: z.enum(['small', 'large', 'other']),
    max_die_weight: z.number().nullable().optional(),
    daily_running_cost: z.number().min(0),
    status: z.enum(['active', 'inactive']).optional(),
});

export class MachineController {
    async create(req: Request, res: Response) {
        try {
            const validatedData = createMachineSchema.parse(req.body);
            const machine = await machineService.createMachine(validatedData);
            res.status(201).json(machine);
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
            const machines = await machineService.getAllMachines();
            res.json(machines);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async get(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const machine = await machineService.getMachineById(id as string);
            res.json(machine);
        } catch (error: any) {
            res.status(404).json({ error: 'Machine not found' });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const validatedData = createMachineSchema.partial().parse(req.body);
            const machine = await machineService.updateMachine(id, validatedData);
            res.json(machine);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else if (error.message.includes('not found')) {
                res.status(404).json({ error: 'Machine not found' });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const result = await machineService.deleteMachine(id);
            res.json(result);
        } catch (error: any) {
            if (error.message.includes('foreign key')) {
                res.status(409).json({ error: 'Cannot delete machine with production history' });
            } else {
                res.status(404).json({ error: 'Machine not found' });
            }
        }
    }
}

export const machineController = new MachineController();

