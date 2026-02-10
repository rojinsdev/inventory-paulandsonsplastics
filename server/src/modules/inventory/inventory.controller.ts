import { Request, Response } from 'express';
import { inventoryService } from './inventory.service';
import { z } from 'zod';

const packSchema = z.object({
    product_id: z.string().uuid(),
    packets_created: z.number().int().positive(),
});

const bundleSchema = z.object({
    product_id: z.string().uuid(),
    bundles_created: z.number().int().positive(),
    source: z.enum(['packed', 'semi_finished']).optional().default('packed'),
});

export class InventoryController {
    async pack(req: Request, res: Response) {
        try {
            const { product_id, packets_created } = packSchema.parse(req.body);
            await inventoryService.packItems(product_id, packets_created);
            res.status(200).json({ message: 'Packing successful' });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async bundle(req: Request, res: Response) {
        try {
            const { product_id, bundles_created, source } = bundleSchema.parse(req.body);
            await inventoryService.bundlePackets(product_id, bundles_created, source);
            res.status(200).json({ message: 'Bundling successful' });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async getStock(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const stock = await inventoryService.getStock(id as string);
            res.json(stock);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async listAll(req: Request, res: Response) {
        try {
            const factoryId = req.query.factory_id as string;
            const stock = await inventoryService.getAllStock(factoryId);
            res.json(stock);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getStockOverview(req: Request, res: Response) {
        try {
            const factoryId = req.query.factory_id as string;
            console.log(`[InventoryController] Fetching stock overview for factory: ${factoryId || 'ALL'}`);
            const stock = await inventoryService.getStockOverview(factoryId);
            console.log(`[InventoryController] Found ${stock.length} products with stock data`);
            res.json(stock);
        } catch (error: any) {
            console.error('[InventoryController] Error in getStockOverview:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async getAvailable(req: Request, res: Response) {
        try {
            const factoryId = req.query.factory_id as string;
            const stock = await inventoryService.getAvailableStock(factoryId);
            res.json(stock);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    // Raw Materials
    async getRawMaterials(req: Request, res: Response) {
        try {
            const factoryId = req.query.factory_id as string;
            const materials = await inventoryService.getRawMaterials(factoryId);
            res.json(materials);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async adjustRawMaterial(req: Request, res: Response) {
        try {
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
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async createRawMaterial(req: Request, res: Response) {
        try {
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
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async updateRawMaterial(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const data = z.object({
                name: z.string().min(1).optional(),
                bag_weight_kg: z.number().positive().optional(),
                type: z.string().optional(),
                min_threshold_kg: z.number().min(0).optional()
            }).parse(req.body);

            const result = await inventoryService.updateRawMaterial(id, data);
            res.json(result);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }
}


export const inventoryController = new InventoryController();

