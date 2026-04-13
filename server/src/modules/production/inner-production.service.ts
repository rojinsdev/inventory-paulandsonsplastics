import { supabase } from '../../config/supabase';
import { AppError } from '../../utils/AppError';
import { getPagination } from '../../utils/supabase';
import logger from '../../utils/logger';
import { eventBus } from '../../core/eventBus';
import { SystemEvents } from '../../core/events';
import { SubmitInnerProductionDTO, InnerProductionFilters } from './production.types';
import { MAIN_FACTORY_ID, calculateShiftDuration, validateNoOverlap } from './production.utils';

export class InnerProductionService {
    async submitInnerProduction(data: SubmitInnerProductionDTO) {
        const factoryId = data.factory_id || MAIN_FACTORY_ID;

        // 1. Get Inner Details and Template
        const { data: inner, error: innerError } = await supabase
            .from('inners')
            .select(`
                id, 
                ideal_cycle_time_seconds,
                template:inner_templates(ideal_weight_grams, raw_material_id, cavity_count)
            `)
            .eq('id', data.inner_id)
            .single();

        if (innerError || !inner) {
            throw new AppError(`Inner not found`, 404);
        }

        const template = (inner as any).template;
        const ideal_cycle_time = inner.ideal_cycle_time_seconds || 0;
        const cavity_count = template.cavity_count || 1;

        // 2. Validate Overlap
        await validateNoOverlap(data.machine_id, data.date, data.shift_number, data.start_time, data.end_time, 'inner_production_logs');

        // 3. Calculate Downtime (Business Logic: No damaged_count subtraction for inners)
        const shiftDuration = calculateShiftDuration(data.start_time, data.end_time, data.shift_number);
        const actual_cycle_time = data.actual_cycle_time_seconds ?? ideal_cycle_time;

        let final_quantity = data.total_produced;
        let final_weight_kg = data.total_weight_produced_kg;

        if (final_quantity === undefined && final_weight_kg !== undefined) {
            final_quantity = Math.floor((final_weight_kg * 1000) / template.ideal_weight_grams);
        } else if (final_quantity !== undefined && final_weight_kg === undefined) {
            final_weight_kg = (final_quantity * template.ideal_weight_grams) / 1000;
        }

        if (final_quantity === undefined || final_weight_kg === undefined) {
            throw new AppError('Either total_produced or total_weight_produced_kg must be provided', 400);
        }

        const actual_production_time = (final_quantity / cavity_count) * actual_cycle_time;
        const shift_duration_seconds = shiftDuration * 60;
        const downtime_minutes = data.downtime_minutes ?? Math.max(0, Math.floor((shift_duration_seconds - actual_production_time) / 60));

        if (downtime_minutes > 30 && !data.downtime_reason) {
            throw new AppError(`${downtime_minutes} minutes unaccounted. Please provide downtime reason.`, 400);
        }

        // 4. Atomic Persistence using NEW RPC
        const { data: result, error: rpcError } = await supabase.rpc('submit_inner_production_atomic', {
            p_machine_id: data.machine_id,
            p_inner_id: data.inner_id,
            p_shift_number: data.shift_number,
            p_start_time: data.start_time,
            p_end_time: data.end_time,
            p_total_produced: final_quantity,
            p_downtime_minutes: downtime_minutes,
            p_actual_cycle_time_seconds: actual_cycle_time,
            p_actual_weight_grams: data.actual_weight_grams ?? template.ideal_weight_grams,
            p_weight_wastage_kg: 0,
            p_downtime_reason: data.downtime_reason ?? null,
            p_remarks: data.remarks ?? null,
            p_date: data.date,
            p_user_id: data.user_id,
            p_factory_id: factoryId,
        });

        if (rpcError) {
            logger.error('submit_inner_production_atomic failed:', rpcError);
            throw new AppError(`Inner production failed: ${rpcError.message}`, 500);
        }

        // RPC returns the new log uuid directly
        const logId = result;
        const { data: log } = await supabase.from('inner_production_logs').select('*').eq('id', logId).single();

        eventBus.emit(SystemEvents.INNER_PRODUCTION_SUBMITTED, {
            production_id: log.id,
            inner_id: data.inner_id,
            quantity: final_quantity,
            userId: data.user_id,
            factory_id: factoryId
        });

        return log;
    }

    async getInnerProductionLogs(filters?: InnerProductionFilters) {
        const { from, to } = getPagination(filters?.page || 1, filters?.size || 20);

        let query = supabase
            .from('inner_production_logs')
            .select(`*, inners(color, inner_templates(name))`, { count: 'exact' })
            .order('date', { ascending: false })
            .range(from, to);

        if (filters?.factory_id) query = query.eq('factory_id', filters.factory_id);
        if (filters?.inner_id) query = query.eq('inner_id', filters.inner_id);
        if (filters?.start_date) query = query.gte('date', filters.start_date);
        if (filters?.end_date) query = query.lte('date', filters.end_date);

        const { data, error, count } = await query;
        if (error) {
            logger.error('Get inner production logs error:', error);
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

export const innerProductionService = new InnerProductionService();
