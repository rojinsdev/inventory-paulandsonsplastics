"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerController = exports.CustomerController = void 0;
const customer_service_1 = require("./customer.service");
const zod_1 = require("zod");
const createCustomerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    phone: zod_1.z.string().optional(),
    type: zod_1.z.enum(['permanent', 'seasonal', 'other']).optional(),
    notes: zod_1.z.string().optional(),
});
class CustomerController {
    async create(req, res) {
        try {
            const validatedData = createCustomerSchema.parse(req.body);
            const customer = await customer_service_1.customerService.createCustomer(validatedData);
            res.status(201).json(customer);
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
            const { search } = req.query;
            let customers;
            if (search) {
                customers = await customer_service_1.customerService.searchCustomers(search);
            }
            else {
                customers = await customer_service_1.customerService.getAllCustomers();
            }
            res.json(customers);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async get(req, res) {
        try {
            const { id } = req.params;
            const customer = await customer_service_1.customerService.getCustomerById(id);
            res.json(customer);
        }
        catch (error) {
            res.status(404).json({ error: 'Customer not found' });
        }
    }
    async update(req, res) {
        try {
            const { id } = req.params;
            const validatedData = createCustomerSchema.partial().parse(req.body);
            const customer = await customer_service_1.customerService.updateCustomer(id, validatedData);
            res.json(customer);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                res.status(400).json({ error: error.issues });
            }
            else if (error.message.includes('not found')) {
                res.status(404).json({ error: 'Customer not found' });
            }
            else {
                res.status(500).json({ error: error.message });
            }
        }
    }
    async delete(req, res) {
        try {
            const { id } = req.params;
            const result = await customer_service_1.customerService.deleteCustomer(id);
            res.json(result);
        }
        catch (error) {
            if (error.message.includes('foreign key')) {
                res.status(409).json({ error: 'Cannot delete customer with existing orders' });
            }
            else {
                res.status(404).json({ error: 'Customer not found' });
            }
        }
    }
}
exports.CustomerController = CustomerController;
exports.customerController = new CustomerController();
