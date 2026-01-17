"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productController = exports.ProductController = void 0;
const product_service_1 = require("./product.service");
const zod_1 = require("zod");
const createProductSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    sku: zod_1.z.string().optional(),
    size: zod_1.z.string().min(1),
    color: zod_1.z.string().min(1),
    weight_grams: zod_1.z.number().positive(),
    selling_price: zod_1.z.number().positive().optional(),
    items_per_packet: zod_1.z.number().int().positive().optional(),
    packets_per_bundle: zod_1.z.number().int().positive().optional(),
});
class ProductController {
    async create(req, res) {
        try {
            const validatedData = createProductSchema.parse(req.body);
            const product = await product_service_1.productService.createProduct(validatedData);
            res.status(201).json(product);
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
            const products = await product_service_1.productService.getAllProducts();
            res.json(products);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async get(req, res) {
        try {
            const { id } = req.params;
            const product = await product_service_1.productService.getProductById(id);
            res.json(product);
        }
        catch (error) {
            res.status(404).json({ error: 'Product not found' });
        }
    }
    async update(req, res) {
        try {
            const { id } = req.params;
            const validatedData = createProductSchema.partial().parse(req.body);
            const product = await product_service_1.productService.updateProduct(id, validatedData);
            res.json(product);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                res.status(400).json({ error: error.issues });
            }
            else if (error.message.includes('not found')) {
                res.status(404).json({ error: 'Product not found' });
            }
            else {
                res.status(500).json({ error: error.message });
            }
        }
    }
    async delete(req, res) {
        try {
            const { id } = req.params;
            const result = await product_service_1.productService.deleteProduct(id);
            res.json(result);
        }
        catch (error) {
            if (error.message.includes('foreign key')) {
                res.status(409).json({ error: 'Cannot delete product used in production history' });
            }
            else {
                res.status(404).json({ error: 'Product not found' });
            }
        }
    }
}
exports.ProductController = ProductController;
exports.productController = new ProductController();
