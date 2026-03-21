import { Request, Response } from 'express';
import { salesOrderService } from './sales-order.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth';

import { AppError } from '../../utils/AppError';

const createOrderSchema = z.object({
    customer_id: z.string().uuid(),
    delivery_date: z.string().optional(), // Added: Delivery date
    items: z.array(z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().positive(),
        unit_type: z.enum(['bundle', 'packet', 'loose']).optional(),
        unit_price: z.number().positive().optional(),
    })).min(1),
    notes: z.string().optional(),
});

const updateStatusSchema = z.object({
    status: z.enum(['reserved', 'delivered', 'cancelled', 'pending']),
});

export class SalesOrderController {
    async create(req: AuthRequest, res: Response) {
        const validatedData = createOrderSchema.parse(req.body);
        const order = await salesOrderService.createOrder({
            ...validatedData,
            user_id: req.user!.id, // Pass user_id for audit logging
        });
        res.status(201).json(order);
    }

    async update(req: AuthRequest, res: Response) {
        const { id } = req.params;
        const validatedData = createOrderSchema.parse(req.body);
        const order = await salesOrderService.updateOrder(id, {
            ...validatedData,
            user_id: req.user!.id,
        });
        res.json(order);
    }

    async list(req: Request, res: Response) {
        const filters = {
            status: req.query.status as string,
            factoryId: req.query.factory_id as string,
            page: req.query.page ? parseInt(req.query.page as string) : 1,
            size: req.query.size ? parseInt(req.query.size as string) : 10,
        };
        const result = await salesOrderService.getAllOrders(filters);
        res.json(result);
    }

    async get(req: Request, res: Response) {
        const { id } = req.params;
        const order = await salesOrderService.getOrderById(id);
        if (!order) {
            throw new AppError('Order not found', 404);
        }
        res.json(order);
    }

    async updateStatus(req: AuthRequest, res: Response) {
        const { id } = req.params;
        const { status } = updateStatusSchema.parse(req.body);
        const order = await salesOrderService.updateOrderStatus(id, status, req.user!.id);
        res.json(order);
    }

    async deliver(req: AuthRequest, res: Response) {
        const { id } = req.params;
        const order = await salesOrderService.updateOrderStatus(id, 'delivered', req.user!.id);
        res.json(order);
    }

    async cancel(req: AuthRequest, res: Response) {
        const { id } = req.params;
        const order = await salesOrderService.updateOrderStatus(id, 'cancelled', req.user!.id);
        res.json(order);
    }

    async prepareItem(req: AuthRequest, res: Response) {
        const { itemId } = req.params;
        const result = await salesOrderService.prepareOrderItem(itemId, req.user!.id);
        res.json(result);
    }

    async processDelivery(req: AuthRequest, res: Response) {
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
    }

    async recordPayment(req: AuthRequest, res: Response) {
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
    }

    async getCustomerPaymentHistory(req: Request, res: Response) {
        const { customerId } = req.params;
        const history = await salesOrderService.getCustomerPaymentHistory(customerId);
        res.json(history);
    }

    async getPendingPayments(req: Request, res: Response) {
        const filters = {
            customer_id: req.query.customer_id as string,
            is_overdue: req.query.is_overdue === 'true',
            status: req.query.status as string,
            factoryId: req.query.factory_id as string
        };
        const payments = await salesOrderService.getPendingPayments(filters);
        res.json(payments);
    }

    async delete(req: Request, res: Response) {
        const { id } = req.params;
        const result = await salesOrderService.deleteOrder(id);
        res.json(result);
    }

    async checkOverdue(req: AuthRequest, res: Response) {
        const result = await salesOrderService.checkAndUpdateOverdueOrders();
        res.json({
            success: true,
            message: `Marked ${result.count} orders as overdue`,
            count: result.count,
            orders: result.orders
        });
    }
}

export const salesOrderController = new SalesOrderController();

