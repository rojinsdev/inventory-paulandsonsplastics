import { Request, Response } from 'express';
import { inventoryService } from './inventory.service';
import { z } from 'zod';

const packSchema = z.object({
    product_id: z.string().uuid(),
    packets_created: z.number().int().positive(),
    cap_id: z.string().uuid().optional(),
});

const bundleSchema = z.object({
    product_id: z.string().uuid(),
    bundles_created: z.number().int().positive(),
    source: z.enum(['packed', 'semi_finished']).optional().default('packed'),
    cap_id: z.string().uuid().optional(),
});

const unpackSchema = z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().positive(),
    from_state: z.enum(['finished', 'packed']),
    to_state: z.enum(['packed', 'semi_finished']),
    cap_id: z.string().uuid().optional(),
});


export class InventoryController {
    async pack(req: Request, res: Response) {
        const { product_id, packets_created, cap_id } = packSchema.parse(req.body);
        await inventoryService.packItems(product_id, packets_created, cap_id);
        res.status(200).json({ message: 'Packing successful' });
    }

    async bundle(req: Request, res: Response) {
        const { product_id, bundles_created, source, cap_id } = bundleSchema.parse(req.body);
        await inventoryService.bundlePackets(product_id, bundles_created, source, cap_id);
        res.status(200).json({ message: 'Bundling successful' });
    }

    async unpack(req: Request, res: Response) {
        const { product_id, quantity, from_state, to_state, cap_id } = unpackSchema.parse(req.body);
        await inventoryService.unpack(product_id, quantity, from_state, to_state, cap_id);
        res.status(200).json({ message: 'Unpacking successful' });
    }

    async getStock(req: Request, res: Response) {
        const { id } = req.params;
        const stock = await inventoryService.getStock(id as string);
        res.json(stock);
    }

    async listAll(req: Request, res: Response) {
        const filters = {
            factoryId: req.query.factory_id as string,
            page: req.query.page ? parseInt(req.query.page as string) : 1,
            size: req.query.size ? parseInt(req.query.size as string) : 10,
        };
        const result = await inventoryService.getAllStock(filters);
        res.json(result);
    }

    async getStockOverview(req: Request, res: Response) {
        const factoryId = req.query.factory_id as string;
        const stock = await inventoryService.getStockOverview(factoryId);
        res.json(stock);
    }

    async getAvailable(req: Request, res: Response) {
        const factoryId = req.query.factory_id as string;
        const stock = await inventoryService.getAvailableStock(factoryId);
        res.json(stock);
    }

    // Raw Materials
    async getRawMaterials(req: Request, res: Response) {
        const filters = {
            factoryId: req.query.factory_id as string,
            page: req.query.page ? parseInt(req.query.page as string) : 1,
            size: req.query.size ? parseInt(req.query.size as string) : 10,
        };
        const result = await inventoryService.getRawMaterials(filters);
        res.json(result);
    }

    async adjustRawMaterial(req: Request, res: Response) {
        const { id } = req.params;
        const data = z.object({
            quantity: z.number(),
            unit: z.enum(['bags', 'kg', 'tons']),
            rate_per_kg: z.number().min(0),
            reason: z.string().min(1),
            payment_mode: z.enum(['Cash', 'Credit']).optional()
        }).parse(req.body);

        const result = await inventoryService.adjustRawMaterial(id, data);
        res.json(result);
    }

    async createRawMaterial(req: Request, res: Response) {
        const data = z.object({
            name: z.string().min(1),
            stock_weight_kg: z.number().min(0),
            factory_id: z.string().uuid().optional(),
            bag_weight_kg: z.number().positive().optional(),
            last_cost_per_kg: z.number().min(0).optional(),
            type: z.string().optional(),
            min_threshold_kg: z.number().min(0).optional()
        }).parse(req.body);

        const result = await inventoryService.createRawMaterial(data);
        res.status(201).json(result);
    }

    async updateRawMaterial(req: Request, res: Response) {
        const { id } = req.params;
        const data = z.object({
            name: z.string().min(1).optional(),
            bag_weight_kg: z.number().positive().optional(),
            type: z.string().optional(),
            min_threshold_kg: z.number().min(0).optional()
        }).parse(req.body);

        const result = await inventoryService.updateRawMaterial(id, data);
        res.json(result);
    }
}


export const inventoryController = new InventoryController();

