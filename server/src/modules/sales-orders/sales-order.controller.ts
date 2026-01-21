import { Request, Response } from 'express';
import { salesOrderService } from './sales-order.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth';

const createOrderSchema = z.object({
    customer_id: z.string().uuid(),
    items: z.array(z.object({
        product_id: z.string().uuid(),
        quantity_bundles: z.number().int().positive(),
    })).min(1),
    notes: z.string().optional(),
});

const updateStatusSchema = z.object({
    status: z.enum(['reserved', 'delivered', 'cancelled']),
});

export class SalesOrderController {
    async create(req: AuthRequest, res: Response) {
        try {
            const validatedData = createOrderSchema.parse(req.body);
            const order = await salesOrderService.createOrder({
                ...validatedData,
                user_id: req.user!.id, // Pass user_id for audit logging
            });
            res.status(201).json(order);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else if (error.message.includes('Insufficient stock')) {
                res.status(409).json({ error: error.message });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async list(req: Request, res: Response) {
        try {
            const orders = await salesOrderService.getAllOrders();
            res.json(orders);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async get(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const order = await salesOrderService.getOrderById(id);
            res.json(order);
        } catch (error: any) {
            res.status(404).json({ error: 'Order not found' });
        }
    }

    async updateStatus(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const { status } = updateStatusSchema.parse(req.body);
            const order = await salesOrderService.updateOrderStatus(id, status, req.user!.id);
            res.json(order);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else if (error.message.includes('Cannot') || error.message.includes('Can only')) {
                res.status(409).json({ error: error.message });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const result = await salesOrderService.deleteOrder(id);
            res.json(result);
        } catch (error: any) {
            if (error.message.includes('Cannot delete')) {
                res.status(409).json({ error: error.message });
            } else {
                res.status(404).json({ error: 'Order not found' });
            }
        }
    }
}

export const salesOrderController = new SalesOrderController();
