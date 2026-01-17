"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.machineProductController = exports.MachineProductController = void 0;
const machine_product_service_1 = require("./machine-product.service");
const zod_1 = require("zod");
const createMappingSchema = zod_1.z.object({
    machine_id: zod_1.z.string().uuid(),
    product_id: zod_1.z.string().uuid(),
    cycle_time_seconds: zod_1.z.number().positive(),
    capacity_restriction: zod_1.z.string().optional(),
});
class MachineProductController {
    async create(req, res) {
        try {
            const validatedData = createMappingSchema.parse(req.body);
            const mapping = await machine_product_service_1.machineProductService.createMapping(validatedData);
            res.status(201).json(mapping);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                res.status(400).json({ error: error.issues });
            }
            else if (error.message.includes('already exists')) {
                res.status(409).json({ error: error.message });
            }
            else {
                res.status(500).json({ error: error.message });
            }
        }
    }
    async list(req, res) {
        try {
            const { machine_id, product_id } = req.query;
            let mappings;
            if (machine_id) {
                mappings = await machine_product_service_1.machineProductService.getMappingsByMachine(machine_id);
            }
            else if (product_id) {
                mappings = await machine_product_service_1.machineProductService.getMappingsByProduct(product_id);
            }
            else {
                mappings = await machine_product_service_1.machineProductService.getAllMappings();
            }
            res.json(mappings);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async get(req, res) {
        try {
            const { id } = req.params;
            const mapping = await machine_product_service_1.machineProductService.getMappingById(id);
            res.json(mapping);
        }
        catch (error) {
            res.status(404).json({ error: 'Mapping not found' });
        }
    }
    async update(req, res) {
        try {
            const { id } = req.params;
            const validatedData = createMappingSchema.partial().parse(req.body);
            const mapping = await machine_product_service_1.machineProductService.updateMapping(id, validatedData);
            res.json(mapping);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                res.status(400).json({ error: error.issues });
            }
            else if (error.message.includes('not found')) {
                res.status(404).json({ error: 'Mapping not found' });
            }
            else {
                res.status(500).json({ error: error.message });
            }
        }
    }
    async delete(req, res) {
        try {
            const { id } = req.params;
            const result = await machine_product_service_1.machineProductService.deleteMapping(id);
            res.json(result);
        }
        catch (error) {
            if (error.message.includes('foreign key')) {
                res.status(409).json({ error: 'Cannot delete mapping used in production history' });
            }
            else {
                res.status(404).json({ error: 'Mapping not found' });
            }
        }
    }
}
exports.MachineProductController = MachineProductController;
exports.machineProductController = new MachineProductController();
