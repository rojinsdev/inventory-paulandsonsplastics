import { supabase } from '../../config/supabase';
import { getIsoLocalDate } from '../../utils/dateUtils';
import { AppError } from '../../utils/AppError';
import { SettingsService } from '../settings/settings.service';
import { getPagination } from '../../utils/supabase';
import logger from '../../utils/logger';
import { eventBus } from '../../core/eventBus';
import { SystemEvents } from '../../core/events';
import { SubmitProductionDTO, ProductionFilters } from './production.types';
import { MAIN_FACTORY_ID, calculateShiftDuration, validateNoOverlap, checkRawMaterialAvailability } from './production.utils';

export class StandardProductionService {
    /**
     * Submit Production for standard products (tubs)
     * Implements cycle time loss, weight wastage, and downtime tracking
     */
    async submitProduction(data: SubmitProductionDTO) {
        const productionDate = data.date || getIsoLocalDate();

        // 1. Validate shift times
        const shiftDuration = calculateShiftDuration(data.start_time, data.end_time, data.shift_number);
        if (shiftDuration <= 0) {
            throw new AppError('Invalid shift times: end_time must be after start_time', 400);
        }

        // 2. Check for overlapping sessions
        await validateNoOverlap(data.machine_id, productionDate, data.shift_number, data.start_time, data.end_time);

        // 3. Get Machine Config
        const { data: machine, error: machineError } = await supabase
            .from('machines')
            .select('daily_running_cost, status, factory_id')
            .eq('id', data.machine_id)
            .single();

        if (machineError || !machine || machine.status !== 'active') {
            throw new AppError('Invalid or inactive machine', 400);
        }

        // 4. Get Product Details
        const { data: product, error: productError } = await supabase
            .from('products')
            .select(`
                id, color, selling_price, weight_grams, status, counting_method, raw_material_id, factory_id, template_id
            `)
            .eq('id', data.product_id)
            .single();

        if (productError || !product || product.status !== 'active') {
            throw new AppError('Invalid or inactive product', 400);
        }

        const factoryId = machine.factory_id || product.factory_id || MAIN_FACTORY_ID;

        // 5. Get Ideal Cycle Time and Cavity Count
        const { data: machineProduct, error: mpError } = await supabase
            .from('machine_products')
            .select('ideal_cycle_time_seconds, cavity_count')
            .eq('machine_id', data.machine_id)
            .eq('product_template_id', product.template_id)
            .single();

        if (mpError || !machineProduct) {
            throw new AppError('Machine is not configured for this product template.', 400);
        }

        // ================== CALCULATION PHASE ==================
        const ideal_cycle_time = machineProduct.ideal_cycle_time_seconds;
        let actual_quantity: number;

        if (product.counting_method === 'weight_based') {
            if (!data.total_weight_kg) {
                throw new AppError('total_weight_kg required for weight-based products', 400);
            }
            actual_quantity = Math.floor((data.total_weight_kg * 1000) / product.weight_grams);
        } else {
            if (data.total_produced === undefined) {
                throw new AppError('total_produced required for unit-count products', 400);
            }
            const damaged = data.damaged_count || 0;
            actual_quantity = data.total_produced - damaged;
        }

        if (actual_quantity < 0) {
            throw new AppError('Actual quantity cannot be negative', 400);
        }

        const actual_cycle_time = data.actual_cycle_time_seconds ?? ideal_cycle_time;
        const cavity_count = machineProduct.cavity_count || 1;
        const ideal_production_time = (actual_quantity / cavity_count) * ideal_cycle_time;
        const actual_production_time = (actual_quantity / cavity_count) * actual_cycle_time;

        const shift_duration_seconds = shiftDuration * 60;
        const downtime_seconds = shift_duration_seconds - actual_production_time;
        const downtime_minutes = data.downtime_minutes ?? Math.max(0, Math.floor(downtime_seconds / 60));

        if (downtime_minutes > 30 && !data.downtime_reason) {
            throw new AppError(`${downtime_minutes} minutes unaccounted. Please provide downtime reason.`, 400);
        }

        // Raw Material Check
        const requiredMaterialKg = (product.weight_grams * actual_quantity) / 1000;
        const rawMaterialCheck = await checkRawMaterialAvailability(requiredMaterialKg, product.raw_material_id || '', factoryId);
        if (!rawMaterialCheck.sufficient) {
            throw new AppError(`Insufficient raw material. Need ${requiredMaterialKg.toFixed(2)}kg, have ${rawMaterialCheck.available.toFixed(2)}kg`, 400);
        }

        // Efficiency & Cost Recovery
        const theoretical_quantity = Math.floor((shift_duration_seconds / ideal_cycle_time) * cavity_count);
        const efficiency_percentage = theoretical_quantity > 0 ? Number(((actual_quantity / theoretical_quantity) * 100).toFixed(2)) : 0;

        let is_cost_recovered: boolean | null = null;
        if (product.selling_price && machine.daily_running_cost) {
            const production_value = actual_quantity * product.selling_price;
            const threshold = await SettingsService.getValue<number>('cost_recovery_threshold') || 100;
            const cost_recovery_percentage = (production_value / machine.daily_running_cost) * 100;
            is_cost_recovered = cost_recovery_percentage >= threshold;
        }

        // ================== ATOMIC PERSISTENCE ==================
        const { data: result, error: rpcError } = await supabase.rpc('submit_production_atomic', {
            p_machine_id: data.machine_id,
            p_product_id: data.product_id,
            p_shift_number: data.shift_number,
            p_start_time: data.start_time,
            p_end_time: data.end_time,
            p_total_produced: data.total_produced,
            p_damaged_count: data.damaged_count || 0,
            p_actual_cycle_time_seconds: actual_cycle_time,
            p_actual_weight_grams: data.actual_weight_grams ?? product.weight_grams,
            p_downtime_minutes: downtime_minutes,
            p_downtime_reason: data.downtime_reason ?? null,
            p_date: productionDate,
            p_user_id: data.user_id,
            p_factory_id: factoryId,
            p_efficiency_percentage: efficiency_percentage,
            p_flagged_for_review: is_cost_recovered === false,
            p_wastage_kg: 0,
            p_weight_wastage_kg: 0,
            p_theoretical_quantity: theoretical_quantity,
        });

        if (rpcError) {
            logger.error('submit_production_atomic failed:', rpcError);
            throw new AppError(`Production submission failed: ${rpcError.message}`, 500);
        }

        // RPC returns the new log uuid directly
        const logId = result;
        const { data: log } = await supabase.from('production_logs').select('*').eq('id', logId).single();

        eventBus.emit(SystemEvents.PRODUCTION_SUBMITTED, {
            production_id: log.id,
            machine_id: data.machine_id,
            product_id: data.product_id,
            quantity: actual_quantity,
            userId: data.user_id,
            factory_id: factoryId
        });

        return log;
    }

    async getProductionLogs(filters?: ProductionFilters) {
        const { from, to } = getPagination(filters?.page || 1, filters?.size || 20);

        let query = supabase
            .from('production_logs')
            .select(`
                *,
                machines(name),
                products(name, size, color)
            `, { count: 'exact' })
            .order('date', { ascending: false })
            .range(from, to);

        if (filters?.machine_id) query = query.eq('machine_id', filters.machine_id);
        if (filters?.product_id) query = query.eq('product_id', filters.product_id);
        if (filters?.start_date) query = query.gte('date', filters.start_date);
        if (filters?.end_date) query = query.lte('date', filters.end_date);
        if (filters?.factory_id) query = query.eq('factory_id', filters.factory_id);

        const { data, error, count } = await query;
        if (error) {
            logger.error('Get production logs error:', error);
            throw new AppError(error.message, 500);
        }

        return {
            data,
            pagination: {
                total: count || 0,
                page: filters?.page || 1,
                size: filters?.size || 20,
                pages: Math.ceil((count || 0) / (filters?.size || 20))
            }
        };
    }
}

export const standardProductionService = new StandardProductionService();
