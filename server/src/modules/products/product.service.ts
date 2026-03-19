import { supabase } from '../../config/supabase';

export interface CreateProductDTO {
    name: string;
    sku?: string | null;
    size: string;
    color: string;
    weight_grams: number;
    selling_price?: number;
    items_per_packet?: number;
    packets_per_bundle?: number;
    items_per_bundle?: number;
    packets_per_bag?: number;
    items_per_bag?: number;
    packets_per_box?: number;
    items_per_box?: number;
    bundle_enabled?: boolean;
    bag_enabled?: boolean;
    box_enabled?: boolean;
    status?: 'active' | 'inactive';
    factory_id: string;
    raw_material_id?: string | null;
    template_id?: string | null;
    cap_template_id?: string | null;
}

export interface ProductTemplate {
    id: string;
    name: string;
    size: string;
    weight_grams: number;
    items_per_packet: number;
    packets_per_bundle: number;
    items_per_bundle: number;
    packets_per_bag?: number;
    items_per_bag?: number;
    packets_per_box?: number;
    items_per_box?: number;
    bundle_enabled: boolean;
    bag_enabled: boolean;
    box_enabled: boolean;
    factory_id: string;
    raw_material_id?: string | null;
    cap_template_id?: string | null;
    selling_price?: number | null;
    status: 'active' | 'inactive';
    created_at: string;
    updated_at: string;
    variants?: any[];
}

export class ProductService {
    async createProduct(data: CreateProductDTO) {
        const { data: product, error } = await supabase
            .from('products')
            .insert(data)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return product;
    }

    async getAllProducts(factoryId?: string) {
        let query = supabase
            .from('products')
            .select(`
                *,
                raw_materials(id, name),
                product_templates(name)
            `)
            .order('name', { ascending: true });

        // Filter by factory if provided
        if (factoryId) {
            query = query.eq('factory_id', factoryId);
        }

        const { data: products, error } = await query;

        if (error) throw new Error(error.message);
        return products;
    }

    async getProductById(id: string) {
        const { data: product, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return product;
    }

    async updateProduct(id: string, data: Partial<CreateProductDTO>) {
        const { data: product, error } = await supabase
            .from('products')
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return product;
    }

    async deleteProduct(id: string) {
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { message: 'Product deleted successfully' };
    }

    // --- Template Methods ---

    async createTemplateWithVariants(templateData: any, colors: string[]) {
        // 1. Create the template
        const { data: template, error: tError } = await supabase
            .from('product_templates')
            .insert(templateData)
            .select()
            .single();

        if (tError) throw new Error(tError.message);

        // 2. Create variants (products) for each color
        const variants = colors.map(color => ({
            name: template.name,
            size: template.size,
            color: color,
            weight_grams: template.weight_grams,
            items_per_packet: template.items_per_packet,
            packets_per_bundle: template.packets_per_bundle,
            items_per_bundle: template.items_per_bundle,
            packets_per_bag: template.packets_per_bag,
            items_per_bag: template.items_per_bag,
            packets_per_box: template.packets_per_box,
            items_per_box: template.items_per_box,
            bundle_enabled: template.bundle_enabled,
            bag_enabled: template.bag_enabled,
            box_enabled: template.box_enabled,
            selling_price: template.selling_price,
            factory_id: template.factory_id,
            template_id: template.id,
            raw_material_id: template.raw_material_id, // Propagate raw material
            cap_template_id: template.cap_template_id, // Propagate cap mapping
            sku: `${template.name}-${template.size}-${color}`.toUpperCase().replace(/\s+/g, '_')
        }));

        const { data: createdVariants, error: vError } = await supabase
            .from('products')
            .insert(variants)
            .select();

        if (vError) throw new Error(vError.message);

        return { ...template, variants: createdVariants };
    }

    async updateTemplate(id: string, data: any) {
        const { colors, variants_to_add = [], variants_to_remove = [], ...templateData } = data;

        // 1. Update the template metadata
        const { data: template, error: tError } = await supabase
            .from('product_templates')
            .update(templateData)
            .eq('id', id)
            .select()
            .single();

        if (tError) throw new Error(tError.message);

        // 2. Sync changes to ALL existing variants (name, size, weight, packaging, materials)
        const commonFields = {
            name: template.name,
            size: template.size,
            weight_grams: template.weight_grams,
            items_per_packet: template.items_per_packet,
            packets_per_bundle: template.packets_per_bundle,
            items_per_bundle: template.items_per_bundle,
            packets_per_bag: template.packets_per_bag,
            items_per_bag: template.items_per_bag,
            packets_per_box: template.packets_per_box,
            items_per_box: template.items_per_box,
            bundle_enabled: template.bundle_enabled,
            bag_enabled: template.bag_enabled,
            box_enabled: template.box_enabled,
            selling_price: template.selling_price,
            raw_material_id: template.raw_material_id,
            cap_template_id: template.cap_template_id,
            factory_id: template.factory_id
        };

        const { error: vUpdateError } = await supabase
            .from('products')
            .update(commonFields)
            .eq('template_id', id);

        if (vUpdateError) throw new Error(vUpdateError.message);

        // 3. Handle specific color variant additions
        if (variants_to_add.length > 0) {
            const newVariants = variants_to_add.map((color: string) => ({
                ...commonFields,
                color,
                template_id: id,
                sku: `${template.name}-${template.size}-${color}`.toUpperCase().replace(/\s+/g, '_')
            }));

            const { error: insertError } = await supabase
                .from('products')
                .insert(newVariants);

            if (insertError) throw new Error(insertError.message);
        }

        // 4. Handle variant removals (if needed, though usually we might just deactivate)
        if (variants_to_remove.length > 0) {
            const { error: deleteError } = await supabase
                .from('products')
                .delete()
                .eq('template_id', id)
                .in('color', variants_to_remove);

            if (deleteError) throw new Error(deleteError.message);
        }

        return this.getTemplateById(id);
    }

    async getTemplates(factoryId?: string) {
        let query = supabase
            .from('product_templates')
            .select(`
                *,
                variants:products(*),
                cap_template:cap_templates(id, name)
            `)
            .order('name', { ascending: true });

        if (factoryId) {
            query = query.or(`factory_id.eq.${factoryId},factory_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data;
    }

    async getTemplateById(id: string) {
        const { data, error } = await supabase
            .from('product_templates')
            .select(`
                *,
                variants:products(*),
                cap_template:cap_templates(id, name)
            `)
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return data;
    }
}

export const productService = new ProductService();
