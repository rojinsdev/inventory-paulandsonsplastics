import { supabase } from '../../config/supabase';

export interface CreateProductDTO {
    name: string;
    sku?: string;
    size: string;
    color: string;
    weight_grams: number;
    selling_price?: number;
    items_per_packet?: number;
    packets_per_bundle?: number;
    status?: 'active' | 'inactive';
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

    async getAllProducts() {
        const { data: products, error } = await supabase
            .from('products')
            .select('*')
            .order('name', { ascending: true });

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
