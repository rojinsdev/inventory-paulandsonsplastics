import { Request, Response } from 'express';
import { supplierService } from './supplier.service';
import { z } from 'zod';
import { AppError } from '../../utils/AppError';
import { AuthRequest } from '../../middleware/auth';

const createSupplierSchema = z.object({
    name: z.string().min(1),
    contact_person: z.string().optional(),
    phone: z.string().optional().transform(v => v === '' ? undefined : v),
    email: z.string().email().optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
    address: z.string().optional(),
    gstin: z.string().optional().transform(v => v === '' ? undefined : v),
    credit_limit: z.number().optional().default(0),
    factory_id: z.string().uuid().optional(),
});

export class SupplierController {
    async list(req: Request, res: Response) {
        const { factory_id } = req.query;
        const suppliers = await supplierService.getSuppliers(factory_id as string);
        res.json(suppliers);
    }

    async get(req: Request, res: Response) {
        const { id } = req.params;
        const supplier = await supplierService.getSupplierById(id);
        if (!supplier) throw new AppError('Supplier not found', 404);
        res.json(supplier);
    }

    async create(req: AuthRequest, res: Response) {
        const validatedData = createSupplierSchema.parse(req.body);
        const supplier = await supplierService.createSupplier({
            ...validatedData,
            factory_id: validatedData.factory_id || req.user?.factory_id || undefined
        });
        res.status(201).json(supplier);
    }

    async update(req: Request, res: Response) {
        const { id } = req.params;
        const validatedData = createSupplierSchema.partial().parse(req.body);
        const supplier = await supplierService.updateSupplier(id, validatedData);
        if (!supplier) throw new AppError('Supplier not found', 404);
        res.json(supplier);
    }

    async delete(req: Request, res: Response) {
        const { id } = req.params;
        await supplierService.deleteSupplier(id);
        res.status(204).send();
    }
}

export const supplierController = new SupplierController();
