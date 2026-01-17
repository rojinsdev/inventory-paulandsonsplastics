"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productService = exports.ProductService = void 0;
const supabase_1 = require("../../config/supabase");
class ProductService {
    async createProduct(data) {
        const { data: product, error } = await supabase_1.supabase
            .from('products')
            .insert(data)
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        return product;
    }
    async getAllProducts() {
        const { data: products, error } = await supabase_1.supabase
            .from('products')
            .select('*')
            .order('name', { ascending: true });
        if (error)
            throw new Error(error.message);
        return products;
    }
    async getProductById(id) {
        const { data: product, error } = await supabase_1.supabase
            .from('products')
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            throw new Error(error.message);
        return product;
    }
    async updateProduct(id, data) {
        const { data: product, error } = await supabase_1.supabase
            .from('products')
            .update(data)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        return product;
    }
    async deleteProduct(id) {
        const { error } = await supabase_1.supabase
            .from('products')
            .delete()
            .eq('id', id);
        if (error)
            throw new Error(error.message);
        return { message: 'Product deleted successfully' };
    }
}
exports.ProductService = ProductService;
exports.productService = new ProductService();
