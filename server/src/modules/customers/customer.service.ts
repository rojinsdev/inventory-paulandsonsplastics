import { supabase } from '../../config/supabase';

export interface CreateCustomerDTO {
    name: string;
    phone?: string;
    type?: 'permanent' | 'seasonal' | 'other';
    notes?: string;
}

export class CustomerService {
    async createCustomer(data: CreateCustomerDTO) {
        const { data: customer, error } = await supabase
            .from('customers')
            .insert(data)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return customer;
    }

    async getAllCustomers() {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw new Error(error.message);
        return data;
    }

    async getCustomerById(id: string) {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return data;
    }

    async searchCustomers(query: string) {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .ilike('name', `%${query}%`)
            .order('name', { ascending: true })
            .limit(20);

        if (error) throw new Error(error.message);
        return data;
    }

    async updateCustomer(id: string, data: Partial<CreateCustomerDTO>) {
        const { data: customer, error } = await supabase
            .from('customers')
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return customer;
    }

    async deleteCustomer(id: string) {
        const { error } = await supabase
            .from('customers')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { message: 'Customer deleted successfully' };
    }
}

export const customerService = new CustomerService();
