import { Request, Response } from 'express';
import { salesOrderService } from './sales-order.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth';

const createOrderSchema = z.object({
    customer_id: z.string().uuid(),
    delivery_date: z.string().optional(), // Added: Delivery date
    items: z.array(z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().positive(),
        unit_type: z.enum(['bundle', 'packet', 'loose']).optional(),
    })).min(1),
    notes: z.string().optional(),
});

const updateStatusSchema = z.object({
    status: z.enum(['reserved', 'delivered', 'cancelled', 'pending']),
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
            const filters = {
                status: req.query.status as string,
                factoryId: req.query.factory_id as string,
            };
            const orders = await salesOrderService.getAllOrders(filters);
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

    async deliver(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const order = await salesOrderService.updateOrderStatus(id, 'delivered', req.user!.id);
            res.json(order);
        } catch (error: any) {
            if (error.message.includes('Can only')) {
                res.status(409).json({ error: error.message });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async cancel(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const order = await salesOrderService.updateOrderStatus(id, 'cancelled', req.user!.id);
            res.json(order);
        } catch (error: any) {
            if (error.message.includes('Cannot')) {
                res.status(409).json({ error: error.message });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async prepareItem(req: AuthRequest, res: Response) {
        try {
            const { itemId } = req.params;
            const result = await salesOrderService.prepareOrderItem(itemId, req.user!.id);
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async processDelivery(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const deliverySchema = z.object({
                items: z.array(z.object({
                    item_id: z.string().uuid(),
                    unit_price: z.number().positive()
                })).min(1),
                discount_type: z.enum(['percentage', 'fixed']).optional(),
                discount_value: z.number().min(0).optional(),
                payment_mode: z.enum(['cash', 'credit']),
                credit_deadline: z.string().optional(),
                initial_payment: z.number().min(0).optional(),
                payment_method: z.string().optional(),
                notes: z.string().optional()
            });

            const validatedData = deliverySchema.parse(req.body);
            const order = await salesOrderService.processDelivery(id, {
                ...validatedData,
                user_id: req.user!.id
            });
            res.json(order);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else if (error.message.includes('Only reserved orders')) {
                res.status(409).json({ error: error.message });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async recordPayment(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const paymentSchema = z.object({
                amount: z.number().positive(),
                payment_method: z.string().min(1),
                notes: z.string().optional()
            });

            const validatedData = paymentSchema.parse(req.body);
            const order = await salesOrderService.recordPayment(id, {
                ...validatedData,
                user_id: req.user!.id
            });
            res.json(order);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else if (error.message.includes('exceeds balance') || error.message.includes('no pending balance')) {
                res.status(409).json({ error: error.message });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async getCustomerPaymentHistory(req: Request, res: Response) {
        try {
            const { customerId } = req.params;
            const history = await salesOrderService.getCustomerPaymentHistory(customerId);
            res.json(history);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getPendingPayments(req: Request, res: Response) {
        try {
            const filters = {
                customer_id: req.query.customer_id as string,
                is_overdue: req.query.is_overdue === 'true',
                status: req.query.status as string
            };
            const payments = await salesOrderService.getPendingPayments(filters);
            res.json(payments);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
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

    async checkOverdue(req: AuthRequest, res: Response) {
        try {
            const result = await salesOrderService.checkAndUpdateOverdueOrders();
            res.json({
                success: true,
                message: `Marked ${result.count} orders as overdue`,
                count: result.count,
                orders: result.orders
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const salesOrderController = new SalesOrderController();

