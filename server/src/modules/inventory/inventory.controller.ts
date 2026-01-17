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
            const { product_id, bundles_created } = bundleSchema.parse(req.body);
            await inventoryService.bundlePackets(product_id, bundles_created);
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
            const stock = await inventoryService.getAllStock();
            res.json(stock);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const inventoryController = new InventoryController();
