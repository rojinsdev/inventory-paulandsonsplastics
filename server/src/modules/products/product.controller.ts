import { Request, Response } from 'express';
import { productService } from './product.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth';
import { resolveAuthorizedFactoryId } from '../../utils/auth';

const createTemplateSchema = z.object({
    name: z.string().min(1),
    size: z.string().min(1),
    weight_grams: z.number().positive(),
    items_per_packet: z.number().int().positive().optional().nullable(),
    packets_per_bundle: z.number().int().positive().optional().nullable(),
    items_per_bundle: z.number().int().positive().optional().nullable(),
    packets_per_bag: z.number().int().nonnegative().optional().nullable(),
    items_per_bag: z.number().int().nonnegative().optional().nullable(),
    packets_per_box: z.number().int().nonnegative().optional().nullable(),
    items_per_box: z.number().int().nonnegative().optional().nullable(),
    bundle_enabled: z.boolean().optional().nullable(),
    bag_enabled: z.boolean().optional().nullable(),
    box_enabled: z.boolean().optional().nullable(),
    selling_price: z.number().nonnegative().optional().nullable(),
    factory_id: z.string().uuid('Invalid factory ID'),
    raw_material_id: z.string().uuid('Invalid raw material ID').optional().nullable(),
    cap_template_id: z.string().uuid('Invalid cap template ID').optional().nullable(),
    colors: z.array(z.string().min(1)).min(1),
});

const updateTemplateSchema = createTemplateSchema.extend({
    variants_to_add: z.array(z.string().min(1)).optional(),
    variants_to_remove: z.array(z.string().min(1)).optional(),
}).partial();

const createProductSchema = z.object({
    name: z.string().min(1),
    sku: z.string().nullable().optional(),
    size: z.string().min(1),
    color: z.string().min(1),
    weight_grams: z.number().positive(),
    selling_price: z.number().positive().optional().nullable(),
    items_per_packet: z.number().int().positive().optional().nullable(),
    packets_per_bundle: z.number().int().positive().optional().nullable(),
    items_per_bundle: z.number().int().positive().optional().nullable(),
    packets_per_bag: z.number().int().nonnegative().optional().nullable(),
    items_per_bag: z.number().int().nonnegative().optional().nullable(),
    packets_per_box: z.number().int().nonnegative().optional().nullable(),
    items_per_box: z.number().int().nonnegative().optional().nullable(),
    bundle_enabled: z.boolean().optional().nullable(),
    bag_enabled: z.boolean().optional().nullable(),
    box_enabled: z.boolean().optional().nullable(),
    status: z.enum(['active', 'inactive']).optional(),
    factory_id: z.string().uuid('Invalid factory ID'),
    raw_material_id: z.string().uuid('Invalid raw material ID').optional().nullable(),
});

export class ProductController {
    async create(req: Request, res: Response) {
        try {
            const data = { ...req.body };
            // Convert empty SKU to null to avoid unique constraint collision on empty strings
            if (data.sku === '' || (typeof data.sku === 'string' && data.sku.trim() === '')) {
                data.sku = null;
            }

            const validatedData = createProductSchema.parse(data);
            const product = await productService.createProduct(validatedData);
            res.status(201).json(product);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else if (error.message?.includes('unique constraint') || error.message?.includes('already exists')) {
                res.status(409).json({ error: 'A product with this SKU already exists.' });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async list(req: AuthRequest, res: Response) {
        try {
            const resolvedFactoryId = resolveAuthorizedFactoryId(req);
            const factoryId = resolvedFactoryId || req.query.factory_id as string | undefined;
            const products = await productService.getAllProducts(factoryId);
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
            const data = { ...req.body };

            // Convert empty SKU to null
            if (data.sku === '' || (typeof data.sku === 'string' && data.sku.trim() === '')) {
                data.sku = null;
            }

            const validatedData = createProductSchema.partial().parse(data);
            const product = await productService.updateProduct(id, validatedData);
            res.json(product);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else if (error.message.includes('not found')) {
                res.status(404).json({ error: 'Product not found' });
            } else if (error.message?.includes('unique constraint') || error.message?.includes('already exists')) {
                res.status(409).json({ error: 'A product with this SKU already exists.' });
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

    // --- Template Handlers ---

    async createTemplate(req: Request, res: Response) {
        try {
            const validated = createTemplateSchema.parse(req.body);
            const { colors, ...templateData } = validated;
            const result = await productService.createTemplateWithVariants(templateData, colors);
            res.status(201).json(result);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async listTemplates(req: AuthRequest, res: Response) {
        try {
            const resolvedFactoryId = resolveAuthorizedFactoryId(req);
            const factoryId = resolvedFactoryId || req.query.factory_id as string | undefined;
            const templates = await productService.getTemplates(factoryId);
            res.json(templates);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async updateTemplate(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const validated = updateTemplateSchema.parse(req.body);
            const template = await productService.updateTemplate(id, validated);
            res.json(template);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else if (error.message.includes('not found')) {
                res.status(404).json({ error: 'Template not found' });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async getTemplate(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const template = await productService.getTemplateById(id);
            res.json(template);
        } catch (error: any) {
            res.status(404).json({ error: 'Template not found' });
        }
    }
}

export const productController = new ProductController();
