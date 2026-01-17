"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryController = exports.InventoryController = void 0;
const inventory_service_1 = require("./inventory.service");
const zod_1 = require("zod");
const packSchema = zod_1.z.object({
    product_id: zod_1.z.string().uuid(),
    packets_created: zod_1.z.number().int().positive(),
});
const bundleSchema = zod_1.z.object({
    product_id: zod_1.z.string().uuid(),
    bundles_created: zod_1.z.number().int().positive(),
});
class InventoryController {
    async pack(req, res) {
        try {
            const { product_id, packets_created } = packSchema.parse(req.body);
            await inventory_service_1.inventoryService.packItems(product_id, packets_created);
            res.status(200).json({ message: 'Packing successful' });
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
    async bundle(req, res) {
        try {
            const { product_id, bundles_created } = bundleSchema.parse(req.body);
            await inventory_service_1.inventoryService.bundlePackets(product_id, bundles_created);
            res.status(200).json({ message: 'Bundling successful' });
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
    async getStock(req, res) {
        try {
            const { id } = req.params;
            const stock = await inventory_service_1.inventoryService.getStock(id);
            res.json(stock);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async listAll(req, res) {
        try {
            const stock = await inventory_service_1.inventoryService.getAllStock();
            res.json(stock);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
exports.InventoryController = InventoryController;
exports.inventoryController = new InventoryController();
