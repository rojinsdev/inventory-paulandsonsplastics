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
    status?: 'active' | 'inactive';
    factory_id: string; // Required: which factory this product belongs to
    raw_material_id?: string | null; // Optional: raw material used for this product
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
                raw_materials(id, name)
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
}

export const productService = new ProductService();
