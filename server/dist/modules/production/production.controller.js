"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productionController = exports.ProductionController = void 0;
const production_service_1 = require("./production.service");
const zod_1 = require("zod");
const submitProductionSchema = zod_1.z.object({
    date: zod_1.z.string().optional(),
    machine_id: zod_1.z.string().uuid(),
    product_id: zod_1.z.string().uuid(),
    actual_quantity: zod_1.z.number().int().nonnegative(),
    waste_weight_grams: zod_1.z.number().nonnegative().optional(),
});
class ProductionController {
    async submit(req, res) {
        try {
            const validatedData = submitProductionSchema.parse(req.body);
            const log = await production_service_1.productionService.submitProduction(validatedData);
            res.status(201).json(log);
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
            const filters = {
                machine_id: req.query.machine_id,
                product_id: req.query.product_id,
                start_date: req.query.start_date,
                end_date: req.query.end_date,
            };
            const logs = await production_service_1.productionService.getProductionLogs(filters);
            res.json(logs);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async getDailyProduction(req, res) {
        try {
            const { date } = req.params;
            const logs = await production_service_1.productionService.getDailyProduction(date);
            res.json(logs);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
exports.ProductionController = ProductionController;
exports.productionController = new ProductionController();
