import { Request, Response } from 'express';
import { productService } from './product.service';
import { z } from 'zod';

const createProductSchema = z.object({
    name: z.string().min(1),
    sku: z.string().optional(),
    size: z.string().min(1),
    color: z.string().min(1),
    weight_grams: z.number().positive(),
    selling_price: z.number().positive().optional(),
    items_per_packet: z.number().int().positive().optional(),
    packets_per_bundle: z.number().int().positive().optional(),
});

export class ProductController {
    async create(req: Request, res: Response) {
        try {
            const validatedData = createProductSchema.parse(req.body);
            const product = await productService.createProduct(validatedData);
            res.status(201).json(product);
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
            const products = await productService.getAllProducts();
            res.json(products);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async get(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const product = await productService.getProductById(id);
            res.json(product);
        } catch (error: any) {
            res.status(404).json({ error: 'Product not found' });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const validatedData = createProductSchema.partial().parse(req.body);
            const product = await productService.updateProduct(id, validatedData);
            res.json(product);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else if (error.message.includes('not found')) {
                res.status(404).json({ error: 'Product not found' });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const result = await productService.deleteProduct(id);
            res.json(result);
        } catch (error: any) {
            if (error.message.includes('foreign key')) {
                res.status(409).json({ error: 'Cannot delete product used in production history' });
            } else {
                res.status(404).json({ error: 'Product not found' });
            }
        }
    }
}

export const productController = new ProductController();
