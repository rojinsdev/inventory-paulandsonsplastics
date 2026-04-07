import { supabase } from '../../config/supabase';

export interface CreateMachineProductDTO {
    machine_id: string;
    product_template_id: string;
    product_id?: string;
    ideal_cycle_time_seconds: number;
    cavity_count?: number;
    capacity_restriction?: number | null;
    enabled?: boolean;
}

export class MachineProductService {
    async createMapping(data: CreateMachineProductDTO) {
        // Check if mapping already exists
        const { data: existing } = await supabase
            .from('machine_products')
            .select('id')
            .eq('machine_id', data.machine_id)
            .eq('product_template_id', data.product_template_id)
            .single();

        if (existing) {
            throw new Error('This machine-template mapping already exists. Use update instead.');
        }

        // CRITICAL: Validate machine and template belong to same factory
        const { data: machine } = await supabase
            .from('machines')
            .select('factory_id')
            .eq('id', data.machine_id)
            .single();

        const { data: template } = await supabase
            .from('product_templates')
            .select('factory_id')
            .eq('id', data.product_template_id)
            .single();

        if (!machine || !template) {
            throw new Error('Invalid machine or product template ID');
        }

        if (machine.factory_id !== template.factory_id) {
            throw new Error('Cannot map machine and template from different factories');
        }

        const { data: mapping, error } = await supabase
            .from('machine_products')
            .insert(data)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return mapping;
    }

    async getAllMappings(factoryId?: string) {
        let query = supabase
            .from('machine_products')
            .select(`
                *,
                machines(id, name, type, category, factory_id),
                product_templates(id, name, size, weight_grams, factory_id)
            `)
            .order('created_at', { ascending: false });

        // Filter by factory if provided (filter on machines.factory_id)
        if (factoryId) {
            query = query.eq('machines.factory_id', factoryId);
        }

        const { data, error } = await query;

        if (error) throw new Error(error.message);
        return data;
    }

    async getMappingsByMachine(machineId: string) {
        const { data, error } = await supabase
            .from('machine_products')
            .select(`
                *,
                product_templates(
                    id, name, size, weight_grams,
                    variants:products(id, color, sku)
                )
            `)
            .eq('machine_id', machineId)
            .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);
        return data;
    }

    async getMappingsByProduct(productTemplateId: string) {
        const { data, error } = await supabase
            .from('machine_products')
            .select(`
                *,
                machines(id, name, type, category, factory_id),
                product_templates(id, name, size, weight_grams)
            `)
            .eq('product_template_id', productTemplateId)
            .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);
        return data;
    }

    async getMappingById(id: string) {
        const { data, error } = await supabase
            .from('machine_products')
            .select(`
                *,
                machines(id, name, type, category),
                product_templates(id, name, size, weight_grams)
            `)
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return data;
    }

    async updateMapping(id: string, data: Partial<CreateMachineProductDTO>) {
        const { data: mapping, error } = await supabase
            .from('machine_products')
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return mapping;
    }

    async deleteMapping(id: string) {
        const { error } = await supabase
            .from('machine_products')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { message: 'Machine-product mapping deleted successfully' };
    }
}

export const machineProductService = new MachineProductService();
