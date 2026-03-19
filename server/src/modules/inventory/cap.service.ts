import { supabase } from '../../config/supabase';

export interface CreateCapDTO {
    name: string;
    color?: string;
    ideal_weight_grams: number;
    ideal_cycle_time_seconds: number;
    factory_id: string;
    raw_material_id?: string;
}

export interface UpdateCapDTO extends Partial<CreateCapDTO> {
    product_ids?: string[]; // IDs of products to map to this cap
}

export interface CreateCapTemplateDTO {
    name: string;
    ideal_weight_grams: number;
    ideal_cycle_time_seconds?: number;
    raw_material_id?: string;
    machine_id?: string;
    factory_id: string;
    colors: string[];
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
        let selectStr = `
            *,
            mapped_products:products(id, name, size, color),
            raw_material:raw_materials(id, name)
        `;

        if (factoryId) {
            selectStr += `,
            stock:cap_stock_balances(quantity)
            `;
        }

        let query = supabase
            .from('caps')
            .select(selectStr)
            .order('name', { ascending: true });

        if (factoryId) {
            query = query.eq('factory_id', factoryId);
            // Also filter the joined stock by the same factory_id to be safe
            query = query.eq('cap_stock_balances.factory_id', factoryId);
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
                *,
                mapped_products:products(id, name, size, color),
                raw_material:raw_materials(id, name)
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

    async getCapStockBalances(factoryId?: string) {
        let query = supabase
            .from('cap_stock_balances')
            .select(`
                *,
                caps (name, ideal_weight_grams, color)
            `);

        if (factoryId) {
            query = query.eq('factory_id', factoryId);
        }

        const { data, error } = await query;

        if (error) throw new Error(error.message);
        return data;
    }

    // --- Template Management ---

    async createTemplateWithVariants(payload: any, colors: string[]) {
        // 1. Create Template (Sanitize data)
        const {
            product_template_ids,
            colors: _colors, // Double safety
            machine_id,
            ...templateData
        } = payload;

        const { data: template, error: tError } = await supabase
            .from('cap_templates')
            .insert([templateData])
            .select()
            .single();

        if (tError) throw new Error(tError.message);

        // 2. Create Variants
        const variants = colors.map(color => ({
            name: template.name,
            color: color,
            ideal_weight_grams: template.ideal_weight_grams,
            ideal_cycle_time_seconds: template.ideal_cycle_time_seconds || 0.0,
            raw_material_id: template.raw_material_id,
            factory_id: template.factory_id,
            template_id: template.id,
            machine_id: machine_id || null
        }));

        const { data: createdVariants, error: vError } = await supabase
            .from('caps')
            .insert(variants)
            .select();

        if (vError) throw new Error(vError.message);

        // 3. Handle Product Template Mapping
        if (product_template_ids && product_template_ids.length > 0) {
            const { error: updateError } = await supabase
                .from('product_templates')
                .update({ cap_template_id: template.id })
                .in('id', product_template_ids);

            if (updateError) throw new Error(updateError.message);
        }

        return { ...template, variants: createdVariants };
    }

    async getTemplates(factoryId?: string) {
        let query = supabase
            .from('cap_templates')
            .select(`
                *,
                variants:caps(
                    *,
                    stock:cap_stock_balances(quantity)
                ),
                mapped_product_templates:product_templates(id, name, size)
            `);

        if (factoryId) {
            query = query.eq('factory_id', factoryId);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data;
    }

    async getTemplateById(id: string) {
        const { data, error } = await supabase
            .from('cap_templates')
            .select(`
                *,
                variants:caps(
                    *,
                    stock:cap_stock_balances(quantity)
                ),
                mapped_product_templates:product_templates(id, name, size)
            `)
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return data;
    }

    async updateTemplate(id: string, data: any) {
        const { product_template_ids, colors, machine_id, ...templateData } = data;

        // 1. Update Cap Template metadata
        const { data: template, error } = await supabase
            .from('cap_templates')
            .update(templateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        // 1.5 Update associated variants (caps)
        const { error: variantError } = await supabase
            .from('caps')
            .update({
                ideal_weight_grams: template.ideal_weight_grams,
                ideal_cycle_time_seconds: template.ideal_cycle_time_seconds,
                raw_material_id: template.raw_material_id,
                machine_id: machine_id || null
            })
            .eq('template_id', id);

        if (variantError) throw new Error(variantError.message);

        // 2. Handle Product Template Mapping
        if (product_template_ids) {
            // First, clear existing mappings for this cap template
            const { error: clearError } = await supabase
                .from('product_templates')
                .update({ cap_template_id: null })
                .eq('cap_template_id', id);

            if (clearError) throw new Error(clearError.message);

            // Then, set the new mappings
            if (product_template_ids.length > 0) {
                const { error: updateError } = await supabase
                    .from('product_templates')
                    .update({ cap_template_id: id })
                    .in('id', product_template_ids);

                if (updateError) throw new Error(updateError.message);
            }
        }

        return template;
    }

    async deleteTemplate(id: string) {
        // 1. Check if any variants have stock balances
        const { data: variants } = await supabase
            .from('caps')
            .select('id')
            .eq('template_id', id);

        if (variants && variants.length > 0) {
            const variantIds = variants.map(v => v.id);
            const { data: balances } = await supabase
                .from('cap_stock_balances')
                .select('quantity')
                .in('cap_id', variantIds)
                .gt('quantity', 0);

            if (balances && balances.length > 0) {
                throw new Error('Cannot delete template: One or more variants have positive stock balances.');
            }
        }

        // 2. Clear Product Template mappings
        const { error: clearError } = await supabase
            .from('product_templates')
            .update({ cap_template_id: null })
            .eq('cap_template_id', id);

        if (clearError) throw new Error(clearError.message);

        // 3. Delete associated variants (caps)
        // Since ON DELETE CASCADE is missing or failing, we do it manually
        const { error: vDeleteError } = await supabase
            .from('caps')
            .delete()
            .eq('template_id', id);

        if (vDeleteError) throw new Error(vDeleteError.message);

        // 4. Finally delete the template
        const { error } = await supabase
            .from('cap_templates')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { success: true };
    }
}

export const capService = new CapService();
