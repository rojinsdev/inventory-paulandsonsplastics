"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.machineProductService = exports.MachineProductService = void 0;
const supabase_1 = require("../../config/supabase");
class MachineProductService {
    async createMapping(data) {
        // Check if mapping already exists
        const { data: existing } = await supabase_1.supabase
            .from('machine_products')
            .select('id')
            .eq('machine_id', data.machine_id)
            .eq('product_id', data.product_id)
            .single();
        if (existing) {
            throw new Error('This machine-product mapping already exists. Use update instead.');
        }
        const { data: mapping, error } = await supabase_1.supabase
            .from('machine_products')
            .insert(data)
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        return mapping;
    }
    async getAllMappings() {
        const { data, error } = await supabase_1.supabase
            .from('machine_products')
            .select(`
                *,
                machines(id, name, code, type, category),
                products(id, name, size, color, weight_grams)
            `)
            .order('created_at', { ascending: false });
        if (error)
            throw new Error(error.message);
        return data;
    }
    async getMappingsByMachine(machineId) {
        const { data, error } = await supabase_1.supabase
            .from('machine_products')
            .select(`
                *,
                products(id, name, size, color, weight_grams, selling_price)
            `)
            .eq('machine_id', machineId)
            .order('created_at', { ascending: false });
        if (error)
            throw new Error(error.message);
        return data;
    }
    async getMappingsByProduct(productId) {
        const { data, error } = await supabase_1.supabase
            .from('machine_products')
            .select(`
                *,
                machines(id, name, code, type, category)
            `)
            .eq('product_id', productId)
            .order('created_at', { ascending: false });
        if (error)
            throw new Error(error.message);
        return data;
    }
    async getMappingById(id) {
        const { data, error } = await supabase_1.supabase
            .from('machine_products')
            .select(`
                *,
                machines(id, name, code, type, category),
                products(id, name, size, color, weight_grams)
            `)
            .eq('id', id)
            .single();
        if (error)
            throw new Error(error.message);
        return data;
    }
    async updateMapping(id, data) {
        const { data: mapping, error } = await supabase_1.supabase
            .from('machine_products')
            .update(data)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        return mapping;
    }
    async deleteMapping(id) {
        const { error } = await supabase_1.supabase
            .from('machine_products')
            .delete()
            .eq('id', id);
        if (error)
            throw new Error(error.message);
        return { message: 'Machine-product mapping deleted successfully' };
    }
}
exports.MachineProductService = MachineProductService;
exports.machineProductService = new MachineProductService();
