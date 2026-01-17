"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productionService = exports.ProductionService = void 0;
const supabase_1 = require("../../config/supabase");
class ProductionService {
    // Core Logic: Calculates Efficiency & Cost Recovery
    async submitProduction(data) {
        // 1. Get Machine Config for Cost Recovery
        const { data: machine, error: machineError } = await supabase_1.supabase
            .from('machines')
            .select('daily_running_cost')
            .eq('id', data.machine_id)
            .single();
        if (machineError || !machine)
            throw new Error('Invalid Machine ID');
        // 2. Get Cycle Time for this formatting
        const { data: machineProduct, error: mpError } = await supabase_1.supabase
            .from('machine_products')
            .select('cycle_time_seconds')
            .eq('machine_id', data.machine_id)
            .eq('product_id', data.product_id)
            .single();
        if (mpError || !machineProduct) {
            // Fallback or Error? Rigid system -> Error.
            throw new Error('This machine is not configured to produce this product (No Cycle Time mapped).');
        }
        // 3. Perform Calculations
        const SHIFT_HOURS = 23; // Hardcoded Rule
        const cycleTime = machineProduct.cycle_time_seconds;
        // Theoretical = Total Seconds Available / Cycle Time per Unit
        // e.g. (23 * 3600) / 13 = 6369 units
        const theoretical_quantity = Math.floor((SHIFT_HOURS * 3600) / cycleTime);
        // Efficiency = (Actual / Theoretical) * 100
        const efficiency_percentage = Number(((data.actual_quantity / theoretical_quantity) * 100).toFixed(2));
        // Cost Recovery Check - Get product selling price
        const { data: product, error: productError } = await supabase_1.supabase
            .from('products')
            .select('selling_price, weight_grams')
            .eq('id', data.product_id)
            .single();
        if (productError || !product) {
            throw new Error('Invalid Product ID');
        }
        // Calculate production value
        // If selling_price exists, use it. Otherwise mark cost recovery as unknown (null)
        let is_cost_recovered = null;
        if (product.selling_price) {
            const production_value = data.actual_quantity * product.selling_price;
            is_cost_recovered = production_value >= machine.daily_running_cost;
        }
        // 4. Insert Log
        const { data: log, error } = await supabase_1.supabase
            .from('production_logs')
            .insert({
            date: data.date || new Date().toISOString(),
            machine_id: data.machine_id,
            product_id: data.product_id,
            shift_hours: SHIFT_HOURS,
            actual_quantity: data.actual_quantity,
            theoretical_quantity,
            efficiency_percentage,
            waste_weight_grams: data.waste_weight_grams || 0,
            is_cost_recovered
        })
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        // 5. Trigger Inventory Update (Semi-Finished)
        // We update 'stock_balances' for 'semi_finished' state
        await this.updateInventory(data.product_id, 'semi_finished', data.actual_quantity);
        // 6. Trigger Raw Material Deduction (pass product weight to avoid redundant query)
        await this.deductRawMaterial(product.weight_grams, data.actual_quantity);
        return log;
    }
    async updateInventory(productId, state, quantity) {
        // Upsert inventory
        // This is race-condition prone without stored procedures, but sufficient for Phase 1 MVP Node logic
        const { data: existing } = await supabase_1.supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', state)
            .single();
        const newQty = (existing?.quantity || 0) + quantity;
        await supabase_1.supabase
            .from('stock_balances')
            .upsert({ product_id: productId, state, quantity: newQty });
    }
    async deductRawMaterial(weightGrams, quantity) {
        const totalWeightGrams = weightGrams * quantity;
        const totalWeightKg = totalWeightGrams / 1000;
        // 2. Fetch the "Standard Plastic Granules" or primary raw material
        // In Phase 1, we assume a single raw material source for simplicity.
        const { data: rawMaterial, error: rmError } = await supabase_1.supabase
            .from('raw_materials')
            .select('id, stock_weight_kg')
            .limit(1)
            .single();
        if (rmError || !rawMaterial) {
            console.warn('⚠️ No raw material found in database to deduct from.');
            return;
        }
        // 3. Deduct Stock
        const newStock = Number((rawMaterial.stock_weight_kg - totalWeightKg).toFixed(4)); // Precision safety
        const { error: updateError } = await supabase_1.supabase
            .from('raw_materials')
            .update({ stock_weight_kg: newStock, updated_at: new Date().toISOString() })
            .eq('id', rawMaterial.id);
        if (updateError) {
            console.error('❌ Failed to update raw material stock:', updateError.message);
        }
        else {
            console.log(`✅ Deducted ${totalWeightKg}kg from Raw Material ID: ${rawMaterial.id}. New Balance: ${newStock}kg`);
        }
    }
    async getProductionLogs(filters) {
        let query = supabase_1.supabase
            .from('production_logs')
            .select(`
                *,
                machines(name, code),
                products(name, size, color)
            `)
            .order('date', { ascending: false });
        if (filters?.machine_id) {
            query = query.eq('machine_id', filters.machine_id);
        }
        if (filters?.product_id) {
            query = query.eq('product_id', filters.product_id);
        }
        if (filters?.start_date) {
            query = query.gte('date', filters.start_date);
        }
        if (filters?.end_date) {
            query = query.lte('date', filters.end_date);
        }
        const { data, error } = await query;
        if (error)
            throw new Error(error.message);
        return data;
    }
    async getDailyProduction(date) {
        const { data, error } = await supabase_1.supabase
            .from('production_logs')
            .select(`
                *,
                machines(name, code, category),
                products(name, size, color)
            `)
            .eq('date', date)
            .order('created_at', { ascending: true });
        if (error)
            throw new Error(error.message);
        return data;
    }
}
exports.ProductionService = ProductionService;
exports.productionService = new ProductionService();
