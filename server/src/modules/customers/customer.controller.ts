import { Request, Response } from 'express';
import { customerService } from './customer.service';
import { z } from 'zod';

const createCustomerSchema = z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    type: z.enum(['permanent', 'seasonal', 'other']).optional(),
    notes: z.string().optional(),
});

export class CustomerController {
    async create(req: Request, res: Response) {
        try {
            const validatedData = createCustomerSchema.parse(req.body);
            const customer = await customerService.createCustomer(validatedData);
            res.status(201).json(customer);
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
            const { search } = req.query;

            let customers;
            if (search) {
                customers = await customerService.searchCustomers(search as string);
            } else {
                customers = await customerService.getAllCustomers();
            }

            res.json(customers);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async get(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const customer = await customerService.getCustomerById(id);
            res.json(customer);
        } catch (error: any) {
            res.status(404).json({ error: 'Customer not found' });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const validatedData = createCustomerSchema.partial().parse(req.body);
            const customer = await customerService.updateCustomer(id, validatedData);
            res.json(customer);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: error.issues });
            } else if (error.message.includes('not found')) {
                res.status(404).json({ error: 'Customer not found' });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const result = await customerService.deleteCustomer(id);
            res.json(result);
        } catch (error: any) {
            if (error.message.includes('foreign key')) {
                res.status(409).json({ error: 'Cannot delete customer with existing orders' });
            } else {
                res.status(404).json({ error: 'Customer not found' });
            }
        }
    }
}

export const customerController = new CustomerController();
