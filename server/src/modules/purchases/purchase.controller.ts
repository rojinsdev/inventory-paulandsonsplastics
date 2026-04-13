import { Request, Response } from 'express';
import { purchaseService } from './purchase.service';
import { z } from 'zod';
import { AppError } from '../../utils/AppError';
import { AuthRequest } from '../../middleware/auth';

const createPurchaseSchema = z.object({
    supplier_id: z.string().uuid().optional(),
    factory_id: z.string().uuid(),
    purchase_date: z.string().optional(),
    item_type: z.enum(['Raw Material', 'Asset', 'Utility', 'Other', 'Finished Product']),
    description: z.string().optional(),
    total_amount: z.number().min(0),
    paid_amount: z.number().min(0),
    balance_due: z.number().min(0),
    raw_material_id: z.string().uuid().optional(),
    product_id: z.string().uuid().optional(),
    cap_id: z.string().uuid().optional(),
    packaging_unit: z.enum(['Loose', 'Packed', 'Bag', 'Bundle', 'Box']).optional(),
    unit_count: z.number().optional(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    rate_per_kg: z.number().optional(),
    payment_mode: z.string().optional(),
    due_date: z.string().optional(),
});

const recordPaymentSchema = z.object({
    purchase_id: z.string().uuid().optional(),
    supplier_id: z.string().uuid(),
    amount: z.number().positive(),
    payment_date: z.string().optional(),
    payment_method: z.string(),
    notes: z.string().optional(),
    factory_id: z.string().uuid(),
});

export class PurchaseController {
    async list(req: Request, res: Response) {
        const { supplier_id, factory_id, item_type } = req.query;
        const purchases = await purchaseService.getPurchases({
            supplier_id: supplier_id as string,
            factory_id: factory_id as string,
            item_type: item_type as string
        });
        res.json(purchases);
    }

    async get(req: Request, res: Response) {
        const { id } = req.params;
        const purchase = await purchaseService.getPurchaseById(id);
        if (!purchase) throw new AppError('Purchase record not found', 404);
        res.json(purchase);
    }

    async create(req: AuthRequest, res: Response) {
        // Normalize frontend data to backend schema
        const purchase_type = req.body.purchase_type;
        const trimDate = (v: unknown) =>
            typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

        const normalizedData = {
            ...req.body,
            item_type: purchase_type === 'raw_material' ? 'Raw Material' : 
                       purchase_type === 'finished_product' ? 'Finished Product' : 
                       (req.body.item_type || 'Other'),
            raw_material_id: (purchase_type === 'raw_material' ? (req.body.item_id || req.body.raw_material_id) : undefined) || undefined,
            product_id: (purchase_type === 'finished_product' ? (req.body.item_id || req.body.product_id) : undefined) || undefined,
            cap_id: req.body.cap_id || undefined,
            supplier_id: req.body.supplier_id || undefined,
            total_amount: Number(req.body.total_amount || 0),
            paid_amount: Number(req.body.paid_amount || 0),
            quantity: req.body.quantity ? Number(req.body.quantity) : undefined,
            unit_count: req.body.unit_count ? Number(req.body.unit_count) : undefined,
            rate_per_kg: req.body.rate ? Number(req.body.rate) : (req.body.rate_per_kg ? Number(req.body.rate_per_kg) : undefined),
            balance_due: req.body.balance_due ?? (Number(req.body.total_amount || 0) - Number(req.body.paid_amount || 0)),
            purchase_date: trimDate(req.body.purchase_date),
            due_date: trimDate(req.body.due_date),
        };

        const validatedData = createPurchaseSchema.parse(normalizedData);
        const purchase = await purchaseService.createPurchase({
            ...validatedData,
            created_by: req.user!.id
        });
        res.status(201).json(purchase);
    }

    async recordPayment(req: AuthRequest, res: Response) {
        // Normalize frontend data to backend schema
        const normalizedData = {
            ...req.body,
            amount: req.body.amount ? Number(req.body.amount) : undefined,
            payment_method: req.body.payment_method || req.body.payment_mode,
            purchase_id: req.body.purchase_id || undefined,
            supplier_id: req.body.supplier_id || undefined,
            factory_id: req.body.factory_id || undefined
        };

        const validatedData = recordPaymentSchema.parse(normalizedData);
        const payment = await purchaseService.recordPayment({
            purchase_id: validatedData.purchase_id,
            supplier_id: validatedData.supplier_id,
            amount: validatedData.amount,
            payment_date: validatedData.payment_date,
            payment_method: validatedData.payment_method,
            notes: validatedData.notes,
            factory_id: validatedData.factory_id,
            created_by: req.user!.id
        });
        res.status(201).json(payment);
    }

    async getPayments(req: Request, res: Response) {
        const { supplier_id } = req.query;
        const payments = await purchaseService.getPaymentHistory(supplier_id as string);
        res.json(payments);
    }
}

export const purchaseController = new PurchaseController();
