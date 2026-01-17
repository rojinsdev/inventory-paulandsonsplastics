"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.machineController = exports.MachineController = void 0;
const machine_service_1 = require("./machine.service");
const zod_1 = require("zod");
const createMachineSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    type: zod_1.z.enum(['extruder', 'cutting', 'printing', 'packing']),
    category: zod_1.z.enum(['small', 'large', 'other']),
    max_die_weight: zod_1.z.number().optional(),
    daily_running_cost: zod_1.z.number().min(0),
});
class MachineController {
    async create(req, res) {
        try {
            const validatedData = createMachineSchema.parse(req.body);
            const machine = await machine_service_1.machineService.createMachine(validatedData);
            res.status(201).json(machine);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                res.status(400).json({ error: error.issues });
            }
            else {
                res.status(500).json({ error: error.message });
            }
        }
    }
    async list(req, res) {
        try {
            const machines = await machine_service_1.machineService.getAllMachines();
            res.json(machines);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async get(req, res) {
        try {
            const { id } = req.params;
            const machine = await machine_service_1.machineService.getMachineById(id);
            res.json(machine);
        }
        catch (error) {
            res.status(404).json({ error: 'Machine not found' });
        }
    }
    async update(req, res) {
        try {
            const { id } = req.params;
            const validatedData = createMachineSchema.partial().parse(req.body);
            const machine = await machine_service_1.machineService.updateMachine(id, validatedData);
            res.json(machine);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                res.status(400).json({ error: error.issues });
            }
            else if (error.message.includes('not found')) {
                res.status(404).json({ error: 'Machine not found' });
            }
            else {
                res.status(500).json({ error: error.message });
            }
        }
    }
    async delete(req, res) {
        try {
            const { id } = req.params;
            const result = await machine_service_1.machineService.deleteMachine(id);
            res.json(result);
        }
        catch (error) {
            if (error.message.includes('foreign key')) {
                res.status(409).json({ error: 'Cannot delete machine with production history' });
            }
            else {
                res.status(404).json({ error: 'Machine not found' });
            }
        }
    }
}
exports.MachineController = MachineController;
exports.machineController = new MachineController();
