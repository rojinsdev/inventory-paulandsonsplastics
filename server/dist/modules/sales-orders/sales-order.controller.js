"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.salesOrderController = exports.SalesOrderController = void 0;
const sales_order_service_1 = require("./sales-order.service");
const zod_1 = require("zod");
const createOrderSchema = zod_1.z.object({
    customer_id: zod_1.z.string().uuid(),
    items: zod_1.z.array(zod_1.z.object({
        product_id: zod_1.z.string().uuid(),
        quantity_bundles: zod_1.z.number().int().positive(),
    })).min(1),
    notes: zod_1.z.string().optional(),
});
const updateStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['reserved', 'delivered', 'cancelled']),
});
class SalesOrderController {
    async create(req, res) {
        try {
            const validatedData = createOrderSchema.parse(req.body);
            const order = await sales_order_service_1.salesOrderService.createOrder(validatedData);
            res.status(201).json(order);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                res.status(400).json({ error: error.issues });
            }
            else if (error.message.includes('Insufficient stock')) {
                res.status(409).json({ error: error.message });
            }
            else {
                res.status(500).json({ error: error.message });
            }
        }
    }
    async list(req, res) {
        try {
            const orders = await sales_order_service_1.salesOrderService.getAllOrders();
            res.json(orders);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async get(req, res) {
        try {
            const { id } = req.params;
            const order = await sales_order_service_1.salesOrderService.getOrderById(id);
            res.json(order);
        }
        catch (error) {
            res.status(404).json({ error: 'Order not found' });
        }
    }
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = updateStatusSchema.parse(req.body);
            const order = await sales_order_service_1.salesOrderService.updateOrderStatus(id, status);
            res.json(order);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                res.status(400).json({ error: error.issues });
            }
            else if (error.message.includes('Cannot') || error.message.includes('Can only')) {
                res.status(409).json({ error: error.message });
            }
            else {
                res.status(500).json({ error: error.message });
            }
        }
    }
    async delete(req, res) {
        try {
            const { id } = req.params;
            const result = await sales_order_service_1.salesOrderService.deleteOrder(id);
            res.json(result);
        }
        catch (error) {
            if (error.message.includes('Cannot delete')) {
                res.status(409).json({ error: error.message });
            }
            else {
                res.status(404).json({ error: 'Order not found' });
            }
        }
    }
}
exports.SalesOrderController = SalesOrderController;
exports.salesOrderController = new SalesOrderController();
