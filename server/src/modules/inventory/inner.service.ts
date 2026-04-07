import { supabase } from '../../config/supabase';

export interface CreateInnerDTO {
    template_id: string;
    color: string;
    factory_id?: string;
}

export interface UpdateInnerDTO extends Partial<CreateInnerDTO> {
    cap_ids?: string[]; // IDs of caps to map to this inner
}

export interface CreateInnerTemplateDTO {
    name: string;
    ideal_weight_grams: number;
    ideal_cycle_time_seconds?: number;
    cavity_count?: number;
    raw_material_id?: string;
    machine_id?: string;
    factory_id: string;
    colors: string[];
}

export class InnerService {
    async createInner(data: any) {
        const { cap_ids, ...innerData } = data;

        const { data: inner, error } = await supabase
            .from('inners')
            .insert([innerData])
            .select()
            .single();

        if (error) throw new Error(error.message);
        return inner;
    }

    async getAllInners(factoryId?: string) {
        let selectStr = `
            *,
            template:inner_templates(
                *,
                raw_material:raw_materials(id, name)
            )
        `;

        if (factoryId) {
            selectStr += `,
            stock:inner_stock_balances(quantity)
            `;
        }

        let query = supabase
            .from('inners')
            .select(selectStr)
            .order('created_at', { ascending: false });

        if (factoryId) {
            query = query.eq('factory_id', factoryId);
            // Note: PostgREST doesn't support easy filtering of nested joins like this in one go if multiple balances exist
            // but normally there's only one balance per factory per inner.
        }

        const { data: inners, error } = await query;
        if (error) throw new Error(error.message);
        return inners;
    }

    async getInnerById(id: string) {
        const { data: inner, error } = await supabase
            .from('inners')
            .select(`
                *,
                template:inner_templates(
                    *,
                    raw_material:raw_materials(id, name)
                ),
                mapped_caps:caps(id, name, color)
            `)
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return inner;
    }

    async updateInner(id: string, data: UpdateInnerDTO) {
        const { cap_ids, ...innerData } = data;

        // 1. Update Inner metadata
        const { data: inner, error } = await supabase
            .from('inners')
            .update(innerData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        // 2. Handle Cap Mapping if provided
        if (cap_ids) {
            // First, clear existing mappings for this inner
            const { error: clearError } = await supabase
                .from('caps')
                .update({ inner_id: null })
                .eq('inner_id', id);

            if (clearError) throw new Error(clearError.message);

            // Then, set the new mappings
            if (cap_ids.length > 0) {
                const { error: updateError } = await supabase
                    .from('caps')
                    .update({ inner_id: id })
                    .in('id', cap_ids);

                if (updateError) throw new Error(updateError.message);
            }
        }

        return inner;
    }

    async deleteInner(id: string) {
        const { error } = await supabase
            .from('inners')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { success: true };
    }

    async getInnerStockBalances(factoryId?: string) {
        let query = supabase
            .from('inners')
            .select(`
                id,
                color,
                factory_id,
                template:inner_templates (name, ideal_weight_grams),
                balance:inner_stock_balances(id, quantity)
            `);

        if (factoryId) {
            query = query.eq('factory_id', factoryId);
        }

        const { data, error } = await query;

        if (error) throw new Error(error.message);
        
        // Map to match the flattened structure expected by the frontend
        return (data || []).map((item: any) => ({
            id: item.balance?.[0]?.id || `temp-${item.id}`,
            inner_id: item.id,
            factory_id: item.factory_id,
            quantity: item.balance?.[0]?.quantity || 0,
            inners: {
                color: item.color,
                inner_templates: item.template
            }
        }));
    }

    // --- Template Management ---

    async createTemplateWithVariants(payload: any, colors: string[]) {
        const {
            product_template_ids,
            tub_template_ids,
            colors: _colors,
            ...templateData
        } = payload;

        const { data: template, error: tError } = await supabase
            .from('inner_templates')
            .insert([templateData])
            .select()
            .single();

        if (tError) throw new Error(tError.message);

        // 2. Create Variants (inners)
        const variants = colors.map(color => ({
            template_id: template.id,
            color: color,
            factory_id: template.factory_id,
            ideal_weight_grams: template.ideal_weight_grams,
            ideal_cycle_time_seconds: template.ideal_cycle_time_seconds
        }));

        const { data: createdVariants, error: vError } = await supabase
            .from('inners')
            .insert(variants)
            .select();

        if (vError) throw new Error(vError.message);

        // 3. Handle Product Template Mapping
        if (product_template_ids && product_template_ids.length > 0) {
            const { error: updateError } = await supabase
                .from('product_templates')
                .update({ inner_template_id: template.id })
                .in('id', product_template_ids);

            if (updateError) throw new Error(updateError.message);
        }

        return { ...template, variants: createdVariants };
    }

    async getTemplates(factoryId?: string) {
        let query = supabase
            .from('inner_templates')
            .select(`
                *,
                variants:inners(
                    *,
                    stock:inner_stock_balances(quantity)
                ),
                mapped_tub_templates:product_templates(id, name)
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
            .from('inner_templates')
            .select(`
                *,
                variants:inners(
                    *,
                    stock:inner_stock_balances(quantity)
                ),
                mapped_tub_templates:product_templates(id, name)
            `)
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return data;
    }

    async updateTemplate(id: string, data: any) {
        const { product_template_ids, tub_template_ids, colors, machine_id, ...templateData } = data;

        const { data: template, error } = await supabase
            .from('inner_templates')
            .update(templateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        // Handle Product Template Mapping
        if (product_template_ids) {
            const { error: clearError } = await supabase
                .from('product_templates')
                .update({ inner_template_id: null })
                .eq('inner_template_id', id);

            if (clearError) throw new Error(clearError.message);

            if (product_template_ids.length > 0) {
                const { error: updateError } = await supabase
                    .from('product_templates')
                    .update({ inner_template_id: id })
                    .in('id', product_template_ids);

                if (updateError) throw new Error(updateError.message);
            }
        }

        return template;
    }

    async deleteTemplate(id: string) {
        // Check for stock
        const { data: variants } = await supabase
            .from('inners')
            .select('id')
            .eq('template_id', id);

        if (variants && variants.length > 0) {
            const variantIds = variants.map(v => v.id);
            const { data: balances } = await supabase
                .from('inner_stock_balances')
                .select('quantity')
                .in('inner_id', variantIds)
                .gt('quantity', 0);

            if (balances && balances.length > 0) {
                throw new Error('Cannot delete template: One or more variants have positive stock balances.');
            }
        }

        // Clear mappings
        const { error: clearError } = await supabase
            .from('product_templates')
            .update({ inner_template_id: null })
            .eq('inner_template_id', id);

        if (clearError) throw new Error(clearError.message);

        // Delete variants manually 
        const { error: vDeleteError } = await supabase
            .from('inners')
            .delete()
            .eq('template_id', id);

        if (vDeleteError) throw new Error(vDeleteError.message);

        const { error } = await supabase
            .from('inner_templates')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { success: true };
    }

    async quickDefineVariant(templateId: string, color: string, factoryId: string) {
        const template = await this.getTemplateById(templateId);

        const variant = {
            template_id: template.id,
            color: color,
            factory_id: factoryId,
            ideal_weight_grams: template.ideal_weight_grams || 0,
            ideal_cycle_time_seconds: template.ideal_cycle_time_seconds || 0
        };

        const { data: created, error } = await supabase
            .from('inners')
            .insert(variant)
            .select()
            .single();

        if (error) throw new Error(`Failed to quick define inner variant: ${error.message}`);
        return created;
    }

    async quickDefineTemplate(name: string, factoryId: string) {
        const templateData = {
            name,
            ideal_weight_grams: 0,
            ideal_cycle_time_seconds: 0,
            factory_id: factoryId
        };

        const { data: template, error } = await supabase
            .from('inner_templates')
            .insert(templateData)
            .select()
            .single();

        if (error) throw new Error(`Failed to quick define inner template: ${error.message}`);
        return template;
    }
}

export const innerService = new InnerService();
