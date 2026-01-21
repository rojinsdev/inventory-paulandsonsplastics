import { supabase } from '../../config/supabase';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';

const auditService = new AuditService();

export interface SubmitProductionDTO {
    date?: string;
    machine_id: string;
    product_id: string;
    actual_quantity: number;
    waste_weight_grams?: number;
    user_id: string; // Added: Track which user submitted the entry
}

export class ProductionService {
    // Core Logic: Calculates Efficiency & Cost Recovery
    async submitProduction(data: SubmitProductionDTO) {
        // Use today's date if not provided
        const productionDate = data.date || new Date().toISOString().split('T')[0];

        // ================== VALIDATION PHASE ==================

        // 1. Validate quantity > 0 (not just >= 0)
        if (data.actual_quantity <= 0) {
            throw new Error('Quantity must be greater than zero');
        }

        // 2. Check for duplicate entry (same machine + product + date)
        const { data: existingEntry } = await supabase
            .from('production_logs')
            .select('id')
            .eq('machine_id', data.machine_id)
            .eq('product_id', data.product_id)
            .eq('date', productionDate)
            .single();

        if (existingEntry) {
            throw new Error('Production entry already exists for this machine and product on this date. Duplicate entries are not allowed.');
        }

        // 3. Get Machine Config and validate it's active
        const { data: machine, error: machineError } = await supabase
            .from('machines')
            .select('daily_running_cost, status') // Changed active -> status
            .eq('id', data.machine_id)
            .single();

        if (machineError || !machine) {
            // Log the actual error for debugging
            console.error('Machine fetch error:', machineError);
            throw new Error('Invalid Machine ID');
        }

        if (machine.status !== 'active') { // Changed .active check to .status === 'active'
            throw new Error('This machine is deactivated. Cannot submit production for inactive machines.');
        }

        // 4. Get Cycle Time for this machine-product combination
        const { data: machineProduct, error: mpError } = await supabase
            .from('machine_products')
            .select('cycle_time_seconds')
            .eq('machine_id', data.machine_id)
            .eq('product_id', data.product_id)
            .single();

        if (mpError || !machineProduct) {
            throw new Error('This machine is not configured to produce this product (No Cycle Time mapped).');
        }

        // 5. Get Product and validate it's active
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('selling_price, weight_grams, status') // Changed active -> status
            .eq('id', data.product_id)
            .single();

        if (productError || !product) {
            console.error('Product fetch error:', productError);
            throw new Error('Invalid Product ID');
        }

        if (product.status !== 'active') { // Changed .active check to .status === 'active'
            throw new Error('This product is deactivated. Cannot submit production for inactive products.');
        }

        // 6. Check raw material availability BEFORE proceeding
        const requiredMaterialKg = (product.weight_grams * data.actual_quantity) / 1000;
        const rawMaterialCheck = await this.checkRawMaterialAvailability(requiredMaterialKg);
        if (!rawMaterialCheck.sufficient) {
            throw new Error(`Insufficient raw material. Need ${requiredMaterialKg.toFixed(2)}kg, have ${rawMaterialCheck.available.toFixed(2)}kg. Cannot proceed.`);
        }

        // ================== CALCULATION PHASE ==================

        // Get shift runtime from settings (fallback to 23 if not found)
        const shiftHours = await SettingsService.getValue<number>('shift_runtime_hours') || 23;
        const cycleTime = machineProduct.cycle_time_seconds;

        // Theoretical = Total Seconds Available / Cycle Time per Unit
        // e.g. (23 * 3600) / 13 = 6369 units
        const theoretical_quantity = Math.floor((shiftHours * 3600) / cycleTime);

        // Efficiency = (Actual / Theoretical) * 100
        const efficiency_percentage = Number(((data.actual_quantity / theoretical_quantity) * 100).toFixed(2));

        // Cost Recovery Check
        let is_cost_recovered: boolean | null = null;

        if (product.selling_price && machine.daily_running_cost) {
            const production_value = data.actual_quantity * product.selling_price;
            const daily_cost = machine.daily_running_cost;

            // Get cost recovery threshold from settings (fallback to 100%)
            const threshold = await SettingsService.getValue<number>('cost_recovery_threshold') || 100;
            const cost_recovery_percentage = (production_value / daily_cost) * 100;

            is_cost_recovered = cost_recovery_percentage >= threshold;
        }

        // ================== PERSISTENCE PHASE ==================

        // Insert Production Log (with user_id if column exists)
        const { data: log, error } = await supabase
            .from('production_logs')
            .insert({
                date: productionDate,
                machine_id: data.machine_id,
                product_id: data.product_id,
                shift_hours: shiftHours,
                actual_quantity: data.actual_quantity,
                theoretical_quantity,
                efficiency_percentage,
                waste_weight_grams: data.waste_weight_grams || 0,
                is_cost_recovered,
                user_id: data.user_id, // Column added via migration 008
            })
            .select()
            .single();

        if (error) throw new Error(error.message);

        // ================== INVENTORY IMPACT ==================

        // Update Semi-Finished Stock
        await this.updateInventory(data.product_id, 'semi_finished', data.actual_quantity);

        // Deduct Raw Material (already validated above)
        await this.deductRawMaterial(product.weight_grams, data.actual_quantity);

        // ================== AUDIT LOGGING ==================

        await auditService.logAction(
            data.user_id,
            'production_entry',
            'production_logs',
            log.id,
            {
                machine_id: data.machine_id,
                product_id: data.product_id,
                actual_quantity: data.actual_quantity,
                efficiency_percentage,
                is_cost_recovered,
                raw_material_deducted_kg: requiredMaterialKg
            }
        );

        return log;
    }

    // NEW: Check if enough raw material exists before production
    private async checkRawMaterialAvailability(requiredKg: number): Promise<{ sufficient: boolean; available: number }> {
        const { data: rawMaterial } = await supabase
            .from('raw_materials')
            .select('stock_weight_kg')
            .limit(1)
            .single();

        const available = rawMaterial?.stock_weight_kg || 0;
        return {
            sufficient: available >= requiredKg,
            available
        };
    }

    private async updateInventory(productId: string, state: string, quantity: number) {
        // Upsert inventory
        // This is race-condition prone without stored procedures, but sufficient for Phase 1 MVP Node logic
        const { data: existing } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', state)
            .single();

        const newQty = (existing?.quantity || 0) + quantity;

        await supabase
            .from('stock_balances')
            .upsert({ product_id: productId, state, quantity: newQty });
    }

    private async deductRawMaterial(weightGrams: number, quantity: number) {
        const totalWeightGrams = weightGrams * quantity;
        const totalWeightKg = totalWeightGrams / 1000;

        // 2. Fetch the "Standard Plastic Granules" or primary raw material
        // In Phase 1, we assume a single raw material source for simplicity.
        const { data: rawMaterial, error: rmError } = await supabase
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

        const { error: updateError } = await supabase
            .from('raw_materials')
            .update({ stock_weight_kg: newStock, updated_at: new Date().toISOString() })
            .eq('id', rawMaterial.id);

        if (updateError) {
            console.error('❌ Failed to update raw material stock:', updateError.message);
        } else {
            console.log(`✅ Deducted ${totalWeightKg}kg from Raw Material ID: ${rawMaterial.id}. New Balance: ${newStock}kg`);
        }
    }

    async getProductionLogs(filters?: { machine_id?: string; product_id?: string; start_date?: string; end_date?: string }) {
        let query = supabase
            .from('production_logs')
            .select(`
                *,
                machines(name),
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
        if (error) throw new Error(error.message);
        return data;
    }

    async getDailyProduction(date: string) {
        const { data, error } = await supabase
            .from('production_logs')
            .select(`
                *,
                machines(name, category),
                products(name, size, color)
            `)
            .eq('date', date)
            .order('created_at', { ascending: true });

        if (error) throw new Error(error.message);
        return data;
    }
}

export const productionService = new ProductionService();
