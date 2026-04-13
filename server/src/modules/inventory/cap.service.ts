import { supabase } from '../../config/supabase';

export interface CreateCapDTO {
    name: string;
    color?: string;
    ideal_weight_grams: number;
    factory_id: string;
    raw_material_id?: string;
}

export interface UpdateCapDTO extends Partial<CreateCapDTO> {
    product_ids?: string[]; // IDs of products to map to this cap
}

export interface CreateCapTemplateDTO {
    name: string;
    ideal_weight_grams: number;
    raw_material_id?: string;
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

    /**
     * Stock lives on cap_stock_balances by production site (factory_id).
     * Do NOT filter by caps.factory_id — that is catalog/home and can differ from where caps were produced.
     */
    async getCapStockBalances(factoryId?: string) {
        let query = supabase
            .from('cap_stock_balances')
            .select(`
                id,
                cap_id,
                factory_id,
                quantity,
                state,
                unit_type,
                caps(id, name, color, ideal_weight_grams)
            `);

        if (factoryId) {
            query = query.eq('factory_id', factoryId);
        }

        const { data, error } = await query;

        if (error) throw new Error(error.message);

        const aggregated = new Map<
            string,
            { id: string; cap_id: string; factory_id: string; quantity: number; caps: any }
        >();

        for (const row of data || []) {
            if (!row.caps) continue;
            const key = `${row.cap_id}:${row.factory_id}`;
            const qty = Number(row.quantity) || 0;
            const existing = aggregated.get(key);
            if (!existing) {
                aggregated.set(key, {
                    id: row.id as string,
                    cap_id: row.cap_id as string,
                    factory_id: row.factory_id as string,
                    quantity: qty,
                    caps: row.caps
                });
            } else {
                existing.quantity += qty;
            }
        }

        return Array.from(aggregated.values());
    }

    /**
     * Total quantity per cap_id from cap_stock_balances, optionally scoped to one production site.
     * Matches aggregation used by getCapStockBalances (all state/unit rows summed per cap at factory).
     */
    private async buildCapStockQuantityMap(
        capIds: string[],
        factoryId?: string
    ): Promise<Map<string, number>> {
        const map = new Map<string, number>();
        const unique = [...new Set(capIds.filter(Boolean))];
        if (unique.length === 0) return map;

        let q = supabase.from('cap_stock_balances').select('cap_id, quantity').in('cap_id', unique);
        if (factoryId) {
            q = q.eq('factory_id', factoryId);
        }

        const { data, error } = await q;
        if (error) throw new Error(error.message);

        for (const row of data || []) {
            const id = row.cap_id as string;
            const qty = Number(row.quantity) || 0;
            map.set(id, (map.get(id) ?? 0) + qty);
        }
        return map;
    }

    private attachCapTemplateVariantStock(templates: any[], qtyMap: Map<string, number>) {
        for (const t of templates) {
            for (const v of t.variants || []) {
                const id = v.id as string | undefined;
                v.stock = { quantity: id ? qtyMap.get(id) ?? 0 : 0 };
            }
        }
    }

    // --- Template Management ---

    async createTemplateWithVariants(payload: any, colors: string[]) {
        // 1. Create Template (Sanitize data)
        const {
            product_template_ids,
            tub_template_ids, // Extra frontend field
            colors: _colors, // Double safety
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
            raw_material_id: template.raw_material_id,
            factory_id: template.factory_id,
            template_id: template.id
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
                variants:caps(*),
                mapped_tub_templates:product_templates(id, name, size)
            `);

        if (factoryId) {
            query = query.eq('factory_id', factoryId);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        const list = data || [];
        const capIds: string[] = [];
        for (const t of list) {
            for (const v of t.variants || []) {
                if (v?.id) capIds.push(v.id as string);
            }
        }
        const qtyMap = await this.buildCapStockQuantityMap(capIds, factoryId);
        this.attachCapTemplateVariantStock(list, qtyMap);
        return list;
    }

    async getTemplateById(id: string, factoryId?: string) {
        const { data, error } = await supabase
            .from('cap_templates')
            .select(`
                *,
                variants:caps(*),
                mapped_tub_templates:product_templates(id, name, size)
            `)
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        const capIds = (data.variants || []).map((v: { id?: string }) => v.id).filter(Boolean) as string[];
        const qtyMap = await this.buildCapStockQuantityMap(capIds, factoryId);
        this.attachCapTemplateVariantStock([data], qtyMap);
        return data;
    }

    async updateTemplate(id: string, data: any) {
        const { product_template_ids, tub_template_ids, colors, ...templateData } = data;

        // 1. Update Cap Template metadata
        const { data: template, error } = await supabase
            .from('cap_templates')
            .update(templateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        // 2. Sync Variations (Caps)
        // 2.1 Fetch existing variants
        const { data: existingVariants, error: fetchError } = await supabase
            .from('caps')
            .select('*')
            .eq('template_id', id);

        if (fetchError) throw new Error(fetchError.message);

        const existingColors = existingVariants?.map(v => v.color) || [];

        // 2.2 Identify operations
        const colorsToAdd = colors.filter((c: string) => !existingColors.includes(c));
        const variantsToRemove = (existingVariants || []).filter(v => !colors.includes(v.color));
        const variantsToKeep = (existingVariants || []).filter(v => colors.includes(v.color));

        // 2.3 Update existing variants (Propagate name, weight, material)
        if (variantsToKeep.length > 0) {
            const { error: updateError } = await supabase
                .from('caps')
                .update({
                    name: template.name,
                    ideal_weight_grams: template.ideal_weight_grams,
                    raw_material_id: template.raw_material_id
                })
                .eq('template_id', id)
                .in('color', colors); // Only those we keep

            if (updateError) throw new Error(updateError.message);
        }

        // 2.4 Add new variants
        if (colorsToAdd.length > 0) {
            const newVariants = colorsToAdd.map((color: string) => ({
                name: template.name,
                color: color,
                ideal_weight_grams: template.ideal_weight_grams,
                raw_material_id: template.raw_material_id,
                factory_id: template.factory_id,
                template_id: template.id
            }));

            const { error: insertError } = await supabase
                .from('caps')
                .insert(newVariants);

            if (insertError) throw new Error(insertError.message);
        }

        // 2.5 Remove deleted variants (Safety check for stock)
        if (variantsToRemove.length > 0) {
            for (const variant of variantsToRemove) {
                // Check stock before deletion
                const { data: stock } = await supabase
                    .from('cap_stock_balances')
                    .select('quantity')
                    .eq('cap_id', variant.id)
                    .gt('quantity', 0);

                if (stock && stock.length > 0) {
                    // Variant has stock - we skip deletion to prevent data loss
                    // In a more advanced UI we'd return a warning, but for now we just skip
                    continue;
                }

                // No stock? Safe to delete
                const { error: deleteError } = await supabase
                    .from('caps')
                    .delete()
                    .eq('id', variant.id);

                if (deleteError) {
                    console.error(`Failed to delete variant ${variant.id}: ${deleteError.message}`);
                }
            }
        }

        // 3. Handle Product Template Mapping
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

    async quickDefineVariant(templateId: string, color: string, factoryId: string, rawMaterialId?: string) {
        const template = await this.getTemplateById(templateId);

        const variant = {
            name: template.name,
            color: color,
            ideal_weight_grams: template.ideal_weight_grams || 0,
            raw_material_id: rawMaterialId || template.raw_material_id,
            factory_id: factoryId,
            template_id: template.id
        };

        const { data: created, error } = await supabase
            .from('caps')
            .insert(variant)
            .select()
            .single();

        if (error) throw new Error(`Failed to quick define cap variant: ${error.message}`);
        return created;
    }

    async quickDefineTemplate(name: string, factoryId: string) {
        const templateData = {
            name,
            ideal_weight_grams: 0,
            factory_id: factoryId
        };

        const { data: template, error } = await supabase
            .from('cap_templates')
            .insert(templateData)
            .select()
            .single();

        if (error) throw new Error(`Failed to quick define cap template: ${error.message}`);
        return template;
    }
}

export const capService = new CapService();
