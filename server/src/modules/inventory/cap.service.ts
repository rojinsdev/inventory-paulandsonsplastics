import { supabase } from '../../config/supabase';

export interface CreateCapDTO {
    name: string;
    color?: string;
    ideal_weight_grams: number;
    ideal_cycle_time_seconds: number;
    factory_id: string;
}

export interface UpdateCapDTO extends Partial<CreateCapDTO> {
    product_ids?: string[]; // IDs of products to map to this cap
}

export class CapService {
    async createCap(data: any) {
        const { product_ids, ...capData } = data;

        const { data: cap, error } = await supabase
            .from('caps')
            .insert([capData])
            .select()
            .single();

        if (error) throw new Error(error.message);
        return cap;
    }

    async getAllCaps(factoryId?: string) {
        let query = supabase
            .from('caps')
            .select(`
                *,
                mapped_products:products(id, name, size, color)
            `)
            .order('name', { ascending: true });

        if (factoryId) {
            query = query.eq('factory_id', factoryId);
        }

        const { data: caps, error } = await query;
        if (error) throw new Error(error.message);
        return caps;
    }

    async getCapById(id: string) {
        const { data: cap, error } = await supabase
            .from('caps')
            .select(`
                *,
                mapped_products:products(id, name, size, color)
            `)
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return cap;
    }

    async updateCap(id: string, data: UpdateCapDTO) {
        const { product_ids, ...capData } = data;

        // 1. Update Cap metadata
        const { data: cap, error } = await supabase
            .from('caps')
            .update(capData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        // 2. Handle Product Mapping if provided
        if (product_ids) {
            // First, clear existing mappings for this cap (set cap_id to null where it was this cap)
            const { error: clearError } = await supabase
                .from('products')
                .update({ cap_id: null })
                .eq('cap_id', id);

            if (clearError) throw new Error(clearError.message);

            // Then, set the new mappings
            if (product_ids.length > 0) {
                const { error: updateError } = await supabase
                    .from('products')
                    .update({ cap_id: id })
                    .in('id', product_ids);

                if (updateError) throw new Error(updateError.message);
            }
        }

        return cap;
    }

    async deleteCap(id: string) {
        const { error } = await supabase
            .from('caps')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { success: true };
    }

    async getCapStockBalances(factoryId: string) {
        const { data, error } = await supabase
            .from('cap_stock_balances')
            .select(`
                *,
                caps (name, ideal_weight_grams)
            `)
            .eq('factory_id', factoryId);

        if (error) throw new Error(error.message);
        return data;
    }
}

export const capService = new CapService();
