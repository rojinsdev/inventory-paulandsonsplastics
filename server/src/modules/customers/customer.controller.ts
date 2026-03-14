import { Request, Response } from 'express';
import { customerService } from './customer.service';
import { z } from 'zod';
import { AppError } from '../../utils/AppError';

const createCustomerSchema = z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    type: z.enum(['permanent', 'seasonal', 'other']).optional(),
    notes: z.string().optional(),
    email: z.string().email().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    gstin: z.string().optional(),
    credit_limit: z.number().optional(),
    payment_terms: z.enum(['immediate', 'net_15', 'net_30', 'net_60']).optional(),
    tags: z.array(z.string()).optional(),
});

const createInteractionSchema = z.object({
    customer_id: z.string().uuid(),
    interaction_type: z.enum(['order_placed', 'order_delivered', 'order_cancelled', 'note_added', 'profile_updated', 'contact_made', 'payment_received', 'credit_limit_changed']),
    description: z.string().optional(),
    metadata: z.record(z.any()).optional(),
    performed_by: z.string().uuid(),
});

export class CustomerController {
    async create(req: Request, res: Response) {
        const validatedData = createCustomerSchema.parse(req.body);
        const customer = await customerService.createCustomer(validatedData);
        res.status(201).json(customer);
    }

    async list(req: Request, res: Response) {
        const { search } = req.query;

        let customers;
        if (search) {
            customers = await customerService.searchCustomers(search as string);
        } else {
            customers = await customerService.getAllCustomers();
        }

        res.json(customers);
    }

    async get(req: Request, res: Response) {
        const { id } = req.params;
        const customer = await customerService.getCustomerById(id);
        if (!customer) throw new AppError('Customer not found', 404);
        res.json(customer);
    }

    async update(req: Request, res: Response) {
        const { id } = req.params;
        const validatedData = createCustomerSchema.partial().parse(req.body);
        const customer = await customerService.updateCustomer(id, validatedData);
        if (!customer) throw new AppError('Customer not found', 404);
        res.json(customer);
    }

    async delete(req: Request, res: Response) {
        const { id } = req.params;
        try {
            const result = await customerService.deleteCustomer(id);
            res.json(result);
        } catch (error: any) {
            if (error.message.includes('foreign key')) {
                throw new AppError('Cannot delete customer with existing orders', 409);
            }
            throw error;
        }
    }

    // ============================================================================
    // Customer Profile & Analytics Endpoints
    // ============================================================================

    async getProfile(req: Request, res: Response) {
        const { id } = req.params;
        const profile = await customerService.getCustomerProfile(id);
        res.json(profile);
    }

    async getPurchaseHistory(req: Request, res: Response) {
        const { id } = req.params;
        const { page, limit } = req.query;

        const options = {
            page: page ? parseInt(page as string) : 1,
            limit: limit ? parseInt(limit as string) : 20
        };

        const history = await customerService.getCustomerPurchaseHistory(id, options);
        res.json(history);
    }

    async getAnalytics(req: Request, res: Response) {
        const { id } = req.params;
        const analytics = await customerService.getCustomerAnalytics(id);
        res.json(analytics);
    }

    // ============================================================================
    // Customer Interactions Endpoints
    // ============================================================================

    async getInteractions(req: Request, res: Response) {
        const { id } = req.params;
        const { page, limit } = req.query;

        const options = {
            page: page ? parseInt(page as string) : 1,
            limit: limit ? parseInt(limit as string) : 50
        };

        const interactions = await customerService.getCustomerInteractions(id, options);
        res.json(interactions);
    }

    async addInteraction(req: Request, res: Response) {
        const validatedData = createInteractionSchema.parse(req.body);
        const interaction = await customerService.addCustomerInteraction(validatedData);
        res.status(201).json(interaction);
    }

    // ============================================================================
    // Customer Segmentation Endpoints
    // ============================================================================

    async getBySegment(req: Request, res: Response) {
        const { segment } = req.params;
        const validSegments = ['vip', 'regular', 'at_risk', 'new', 'inactive'];

        if (!validSegments.includes(segment)) {
            throw new AppError('Invalid segment', 400);
        }

        const customers = await customerService.getCustomersBySegment(segment as any);
        res.json(customers);
    }

    async getVIP(req: Request, res: Response) {
        const { limit } = req.query;
        const customers = await customerService.getVIPCustomers(
            limit ? parseInt(limit as string) : 50
        );
        res.json(customers);
    }

    async getAtRisk(req: Request, res: Response) {
        const { limit } = req.query;
        const customers = await customerService.getAtRiskCustomers(
            limit ? parseInt(limit as string) : 50
        );
        res.json(customers);
    }

    async getStats(req: Request, res: Response) {
        const stats = await customerService.getCustomerStats();
        res.json(stats);
    }
}

export const customerController = new CustomerController();
