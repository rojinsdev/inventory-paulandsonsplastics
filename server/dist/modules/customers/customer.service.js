"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerService = exports.CustomerService = void 0;
const supabase_1 = require("../../config/supabase");
class CustomerService {
    async createCustomer(data) {
        const { data: customer, error } = await supabase_1.supabase
            .from('customers')
            .insert(data)
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        return customer;
    }
    async getAllCustomers() {
        const { data, error } = await supabase_1.supabase
            .from('customers')
            .select('*')
            .order('name', { ascending: true });
        if (error)
            throw new Error(error.message);
        return data;
    }
    async getCustomerById(id) {
        const { data, error } = await supabase_1.supabase
            .from('customers')
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            throw new Error(error.message);
        return data;
    }
    async searchCustomers(query) {
        const { data, error } = await supabase_1.supabase
            .from('customers')
            .select('*')
            .ilike('name', `%${query}%`)
            .order('name', { ascending: true })
            .limit(20);
        if (error)
            throw new Error(error.message);
        return data;
    }
    async updateCustomer(id, data) {
        const { data: customer, error } = await supabase_1.supabase
            .from('customers')
            .update(data)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        return customer;
    }
    async deleteCustomer(id) {
        const { error } = await supabase_1.supabase
            .from('customers')
            .delete()
            .eq('id', id);
        if (error)
            throw new Error(error.message);
        return { message: 'Customer deleted successfully' };
    }
}
exports.CustomerService = CustomerService;
exports.customerService = new CustomerService();
