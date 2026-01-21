import { supabase } from '../../config/supabase';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';

const auditService = new AuditService();

// Updated DTO for new session-based production
export interface SubmitProductionDTO {
    date?: string;
    machine_id: string;
    product_id: string;
    shift_number: 1 | 2; // NEW: 1 = 8AM-8PM, 2 = 8PM-8AM
    start_time: string; // NEW: HH:mm format
    end_time: string; // NEW: HH:mm format

    // For unit-count products
    total_produced?: number; // NEW: Gross count
    damaged_count?: number; // NEW: Defects

    // For weight-based products (caps)
    total_weight_kg?: number; // NEW: For caps

    // Actual metrics
    actual_cycle_time_seconds: number; // NEW: From machine display
    actual_weight_grams: number; // NEW: Measured weight per unit

    // Downtime
    downtime_minutes?: number; // NEW: Calculated or manual
    downtime_reason?: string; // NEW: Required if > 30 mins

    user_id: string;
}

export class ProductionService {
    /**
     * Submit Production - NEW SESSION-BASED LOGIC
     * Implements cycle time loss, weight wastage, and downtime tracking
     */
    async submitProduction(data: SubmitProductionDTO) {
        const productionDate = data.date || new Date().toISOString().split('T')[0];

        // ================== VALIDATION PHASE ==================

        // 1. Validate shift times
        const shiftDuration = this.calculateShiftDuration(data.start_time, data.end_time, data.shift_number);
        if (shiftDuration <= 0) {
            throw new Error('Invalid shift times: end_time must be after start_time');
        }

        // 2. Check for overlapping sessions (same machine, same date, overlapping times)
        await this.validateNoOverlap(data.machine_id, productionDate, data.shift_number, data.start_time, data.end_time);

        // 3. Get Machine Config
        const { data: machine, error: machineError } = await supabase
            .from('machines')
            .select('daily_running_cost, status')
            .eq('id', data.machine_id)
            .single();

        if (machineError || !machine || machine.status !== 'active') {
            throw new Error('Invalid or inactive machine');
        }

        // 4. Get Product and counting method
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('selling_price, weight_grams, status, counting_method')
            .eq('id', data.product_id)
            .single();

        if (productError || !product || product.status !== 'active') {
            throw new Error('Invalid or inactive product');
        }

        // 5. Get Ideal Cycle Time (renamed from cycle_time_seconds)
        const { data: machineProduct, error: mpError } = await supabase
            .from('machine_products')
            .select('ideal_cycle_time_seconds')
            .eq('machine_id', data.machine_id)
            .eq('product_id', data.product_id)
            .single();

        if (mpError || !machineProduct) {
            throw new Error('Machine not configured for this product');
        }

        // ================== CALCULATION PHASE ==================

        const ideal_cycle_time = machineProduct.ideal_cycle_time_seconds;
        let actual_quantity: number;

        // Handle weight-based vs unit-count products
        if (product.counting_method === 'weight_based') {
            // Cap production: estimate quantity from weight
            if (!data.total_weight_kg) {
                throw new Error('total_weight_kg required for weight-based products');
            }
            actual_quantity = Math.floor((data.total_weight_kg * 1000) / product.weight_grams);
        } else {
            // Normal products: use total_produced - damaged_count
            if (data.total_produced === undefined) {
                throw new Error('total_produced required for unit-count products');
            }
            const damaged = data.damaged_count || 0;
            actual_quantity = data.total_produced - damaged;
        }

        if (actual_quantity <= 0) {
            throw new Error('Actual quantity must be greater than zero');
        }

        // === CYCLE TIME LOSS CALCULATION ===
        const ideal_production_time = actual_quantity * ideal_cycle_time;
        const actual_production_time = actual_quantity * data.actual_cycle_time_seconds;
        const cycle_time_loss_seconds = actual_production_time - ideal_production_time;
        const units_lost_to_cycle = Math.floor(cycle_time_loss_seconds / ideal_cycle_time);

        // === DOWNTIME CALCULATION ===
        const shift_duration_seconds = shiftDuration * 60; // Convert minutes to seconds
        const downtime_seconds = shift_duration_seconds - actual_production_time;
        const downtime_minutes = Math.floor(downtime_seconds / 60);

        // Validate downtime reason if > 30 mins
        if (downtime_minutes > 30 && !data.downtime_reason) {
            throw new Error(`${downtime_minutes} minutes unaccounted. Please provide downtime reason.`);
        }

        // === WEIGHT WASTAGE ===
        const ideal_total_weight = actual_quantity * product.weight_grams;
        const actual_total_weight = actual_quantity * data.actual_weight_grams;
        const weight_wastage_grams = Math.max(0, actual_total_weight - ideal_total_weight);
        const weight_wastage_kg = weight_wastage_grams / 1000;

        // === CYCLE TIME VARIANCE ALERT (5% threshold) ===
        const variance_threshold = 1.05;
        const flagged_for_review = data.actual_cycle_time_seconds > (ideal_cycle_time * variance_threshold);

        // === EFFICIENCY (for backward compatibility) ===
        const theoretical_quantity = Math.floor(shift_duration_seconds / ideal_cycle_time);
        const efficiency_percentage = Number(((actual_quantity / theoretical_quantity) * 100).toFixed(2));

        // === RAW MATERIAL CHECK ===
        const requiredMaterialKg = (product.weight_grams * actual_quantity) / 1000;
        const rawMaterialCheck = await this.checkRawMaterialAvailability(requiredMaterialKg);
        if (!rawMaterialCheck.sufficient) {
            throw new Error(`Insufficient raw material. Need ${requiredMaterialKg.toFixed(2)}kg, have ${rawMaterialCheck.available.toFixed(2)}kg`);
        }

        // === COST RECOVERY ===
        let is_cost_recovered: boolean | null = null;
        if (product.selling_price && machine.daily_running_cost) {
            const production_value = actual_quantity * product.selling_price;
            const threshold = await SettingsService.getValue<number>('cost_recovery_threshold') || 100;
            const cost_recovery_percentage = (production_value / machine.daily_running_cost) * 100;
            is_cost_recovered = cost_recovery_percentage >= threshold;
        }

        // ================== PERSISTENCE PHASE ==================

        const { data: log, error } = await supabase
            .from('production_logs')
            .insert({
                date: productionDate,
                machine_id: data.machine_id,
                product_id: data.product_id,
                user_id: data.user_id,

                // Session tracking
                shift_number: data.shift_number,
                start_time: data.start_time,
                end_time: data.end_time,

                // Production metrics
                total_produced: data.total_produced,
                damaged_count: data.damaged_count || 0,
                actual_quantity,

                // Weight-based (caps)
                total_weight_kg: data.total_weight_kg,

                // Cycle time analysis
                actual_cycle_time_seconds: data.actual_cycle_time_seconds,
                units_lost_to_cycle,
                flagged_for_review,

                // Weight analysis
                actual_weight_grams: data.actual_weight_grams,
                weight_wastage_kg,

                // Downtime
                downtime_minutes,
                downtime_reason: data.downtime_reason,

                // Legacy fields (for backward compatibility)
                shift_hours: shiftDuration / 60,
                theoretical_quantity,
                efficiency_percentage,
                is_cost_recovered,
            })
            .select()
            .single();

        if (error) throw new Error(error.message);

        // ================== INVENTORY IMPACT ==================

        await this.updateInventory(data.product_id, 'semi_finished', actual_quantity);
        await this.deductRawMaterial(product.weight_grams, actual_quantity);

        // ================== AUDIT LOGGING ==================

        await auditService.logAction(
            data.user_id,
            'production_entry',
            'production_logs',
            log.id,
            {
                machine_id: data.machine_id,
                product_id: data.product_id,
                shift_number: data.shift_number,
                actual_quantity,
                units_lost_to_cycle,
                weight_wastage_kg,
                downtime_minutes,
                flagged_for_review,
            }
        );

        return log;
    }

    /**
     * Calculate shift duration in minutes
     */
    private calculateShiftDuration(startTime: string, endTime: string, shiftNumber: 1 | 2): number {
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        let startMinutes = startHour * 60 + startMin;
        let endMinutes = endHour * 60 + endMin;

        // Handle overnight shifts (Shift 2: 8PM-8AM)
        if (shiftNumber === 2 && endMinutes < startMinutes) {
            endMinutes += 24 * 60; // Add 24 hours
        }

        return endMinutes - startMinutes;
    }

    /**
     * Validate no overlapping sessions for same machine on same date
     */
    private async validateNoOverlap(
        machineId: string,
        date: string,
        shiftNumber: number,
        startTime: string,
        endTime: string
    ): Promise<void> {
        const { data: existingSessions } = await supabase
            .from('production_logs')
            .select('start_time, end_time')
            .eq('machine_id', machineId)
            .eq('date', date)
            .eq('shift_number', shiftNumber);

        if (existingSessions && existingSessions.length > 0) {
            for (const session of existingSessions) {
                const overlap = this.checkTimeOverlap(
                    startTime, endTime,
                    session.start_time, session.end_time
                );
                if (overlap) {
                    throw new Error(`Session overlaps with existing entry (${session.start_time} - ${session.end_time})`);
                }
            }
        }
    }

    /**
     * Check if two time ranges overlap
     */
    private checkTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
        const toMinutes = (time: string) => {
            const [h, m] = time.split(':').map(Number);
            return h * 60 + m;
        };

        const s1 = toMinutes(start1);
        const e1 = toMinutes(end1);
        const s2 = toMinutes(start2);
        const e2 = toMinutes(end2);

        return (s1 < e2 && e1 > s2);
    }

    // ================== HELPER METHODS (unchanged) ==================

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
        const totalWeightKg = (weightGrams * quantity) / 1000;

        const { data: rawMaterial, error: rmError } = await supabase
            .from('raw_materials')
            .select('id, stock_weight_kg')
            .limit(1)
            .single();

        if (rmError || !rawMaterial) {
            console.warn('⚠️ No raw material found in database to deduct from.');
            return;
        }

        const newStock = Number((rawMaterial.stock_weight_kg - totalWeightKg).toFixed(4));

        await supabase
            .from('raw_materials')
            .update({ stock_weight_kg: newStock, updated_at: new Date().toISOString() })
            .eq('id', rawMaterial.id);
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

        if (filters?.machine_id) query = query.eq('machine_id', filters.machine_id);
        if (filters?.product_id) query = query.eq('product_id', filters.product_id);
        if (filters?.start_date) query = query.gte('date', filters.start_date);
        if (filters?.end_date) query = query.lte('date', filters.end_date);

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
