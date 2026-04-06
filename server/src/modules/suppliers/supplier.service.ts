import { supabase } from '../../config/supabase';

export class SupplierService {
    async getSuppliers(factoryId?: string) {
        let query = supabase.from('suppliers').select('*');
        if (factoryId) query = query.eq('factory_id', factoryId);
        
        const { data, error } = await query.order('name');
        
        if (error) throw new Error(error.message);
        return data;
    }

    async getSupplierById(id: string) {
        const { data, error } = await supabase
            .from('suppliers')
            .select('*')
            .eq('id', id)
            .single();
            
        if (error) throw new Error(error.message);
        return data;
    }

    async createSupplier(data: {
        name: string;
        contact_person?: string;
        phone?: string;
        email?: string;
        address?: string;
        gstin?: string;
        credit_limit?: number;
        factory_id?: string;
    }) {
        const { data: supplier, error } = await supabase
            .from('suppliers')
            .insert(data)
            .select()
            .single();
            
        if (error) throw new Error(error.message);
        return supplier;
    }

    async updateSupplier(id: string, data: Partial<{
        name: string;
        contact_person: string;
        phone: string;
        email: string;
        address: string;
        gstin: string;
        credit_limit: number;
        balance_due: number;
    }>) {
        const { data: supplier, error } = await supabase
            .from('suppliers')
            .update({
                ...data,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();
            
        if (error) throw new Error(error.message);
        return supplier;
    }

    async deleteSupplier(id: string) {
        const { error } = await supabase
            .from('suppliers')
            .delete()
            .eq('id', id);
            
        if (error) throw new Error(error.message);
        return true;
    }
}

export const supplierService = new SupplierService();
