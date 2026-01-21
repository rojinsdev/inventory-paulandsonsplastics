import { supabase } from '../../config/supabase';

export class AnalyticsService {
    /**
     * Get Cycle Time Loss Analysis
     * Shows shifts with significant cycle time losses
     */
    async getCycleTimeLossAnalysis(filters?: {
        start_date?: string;
        end_date?: string;
        machine_id?: string;
        flagged_only?: boolean;
    }) {
        let query = supabase
            .from('production_logs')
            .select(`
                id,
                date,
                shift_number,
                start_time,
                end_time,
                actual_quantity,
                actual_cycle_time_seconds,
                units_lost_to_cycle,
                flagged_for_review,
                machines(name, category),
                products(name, size, color)
            `)
            .order('units_lost_to_cycle', { ascending: false });

        if (filters?.start_date) query = query.gte('date', filters.start_date);
        if (filters?.end_date) query = query.lte('date', filters.end_date);
        if (filters?.machine_id) query = query.eq('machine_id', filters.machine_id);
        if (filters?.flagged_only) query = query.eq('flagged_for_review', true);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        return {
            total_sessions: data?.length || 0,
            total_units_lost: data?.reduce((sum, log) => sum + (log.units_lost_to_cycle || 0), 0) || 0,
            flagged_sessions: data?.filter(log => log.flagged_for_review).length || 0,
            sessions: data,
        };
    }

    /**
     * Get Weight Wastage Report
     * Shows products with excessive material usage
     */
    async getWeightWastageReport(filters?: {
        start_date?: string;
        end_date?: string;
        product_id?: string;
    }) {
        let query = supabase
            .from('production_logs')
            .select(`
                id,
                date,
                shift_number,
                actual_quantity,
                actual_weight_grams,
                weight_wastage_kg,
                machines(name),
                products(name, size, color, weight_grams)
            `)
            .order('weight_wastage_kg', { ascending: false });

        if (filters?.start_date) query = query.gte('date', filters.start_date);
        if (filters?.end_date) query = query.lte('date', filters.end_date);
        if (filters?.product_id) query = query.eq('product_id', filters.product_id);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        return {
            total_wastage_kg: data?.reduce((sum, log) => sum + (log.weight_wastage_kg || 0), 0) || 0,
            sessions: data,
        };
    }

    /**
     * Get Downtime Breakdown
     * Groups downtime by reason
     */
    async getDowntimeBreakdown(filters?: {
        start_date?: string;
        end_date?: string;
        machine_id?: string;
    }) {
        let query = supabase
            .from('production_logs')
            .select(`
                downtime_minutes,
                downtime_reason,
                date,
                shift_number,
                machines(name)
            `)
            .gt('downtime_minutes', 0);

        if (filters?.start_date) query = query.gte('date', filters.start_date);
        if (filters?.end_date) query = query.lte('date', filters.end_date);
        if (filters?.machine_id) query = query.eq('machine_id', filters.machine_id);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        // Group by reason
        const breakdown = data?.reduce((acc: any, log: any) => {
            const reason = log.downtime_reason || 'Unspecified';
            if (!acc[reason]) {
                acc[reason] = {
                    reason,
                    total_minutes: 0,
                    occurrences: 0,
                };
            }
            acc[reason].total_minutes += log.downtime_minutes;
            acc[reason].occurrences += 1;
            return acc;
        }, {});

        return {
            total_downtime_minutes: data?.reduce((sum, log) => sum + (log.downtime_minutes || 0), 0) || 0,
            breakdown: Object.values(breakdown || {}),
            sessions: data,
        };
    }

    /**
     * Get Machine Efficiency Trends
     * Shows efficiency over time for each machine
     */
    async getMachineEfficiencyTrends(filters?: {
        start_date?: string;
        end_date?: string;
        machine_id?: string;
    }) {
        let query = supabase
            .from('production_logs')
            .select(`
                date,
                shift_number,
                efficiency_percentage,
                actual_quantity,
                theoretical_quantity,
                machine_id,
                machines(name, category)
            `)
            .order('date', { ascending: true });

        if (filters?.start_date) query = query.gte('date', filters.start_date);
        if (filters?.end_date) query = query.lte('date', filters.end_date);
        if (filters?.machine_id) query = query.eq('machine_id', filters.machine_id);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        // Group by machine
        const byMachine = data?.reduce((acc: any, log: any) => {
            const machineId = log.machine_id;
            if (!acc[machineId]) {
                acc[machineId] = {
                    machine_id: machineId,
                    machine_name: log.machines?.name,
                    category: log.machines?.category,
                    data_points: [],
                    avg_efficiency: 0,
                };
            }
            acc[machineId].data_points.push({
                date: log.date,
                shift: log.shift_number,
                efficiency: log.efficiency_percentage,
                actual: log.actual_quantity,
                theoretical: log.theoretical_quantity,
            });
            return acc;
        }, {});

        // Calculate averages
        Object.values(byMachine || {}).forEach((machine: any) => {
            const sum = machine.data_points.reduce((s: number, dp: any) => s + dp.efficiency, 0);
            machine.avg_efficiency = Number((sum / machine.data_points.length).toFixed(2));
        });

        return {
            machines: Object.values(byMachine || {}),
        };
    }

    /**
     * Get Shift Performance Comparison
     * Compares Shift 1 vs Shift 2 performance
     */
    async getShiftComparison(filters?: {
        start_date?: string;
        end_date?: string;
    }) {
        let query = supabase
            .from('production_logs')
            .select(`
                shift_number,
                efficiency_percentage,
                actual_quantity,
                units_lost_to_cycle,
                downtime_minutes,
                weight_wastage_kg
            `);

        if (filters?.start_date) query = query.gte('date', filters.start_date);
        if (filters?.end_date) query = query.lte('date', filters.end_date);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const shift1 = data?.filter(log => log.shift_number === 1) || [];
        const shift2 = data?.filter(log => log.shift_number === 2) || [];

        const calculateStats = (logs: any[]) => ({
            sessions: logs.length,
            avg_efficiency: logs.length > 0
                ? Number((logs.reduce((sum, log) => sum + log.efficiency_percentage, 0) / logs.length).toFixed(2))
                : 0,
            total_production: logs.reduce((sum, log) => sum + log.actual_quantity, 0),
            total_units_lost: logs.reduce((sum, log) => sum + (log.units_lost_to_cycle || 0), 0),
            total_downtime_minutes: logs.reduce((sum, log) => sum + (log.downtime_minutes || 0), 0),
            total_weight_wastage_kg: logs.reduce((sum, log) => sum + (log.weight_wastage_kg || 0), 0),
        });

        return {
            shift_1: calculateStats(shift1),
            shift_2: calculateStats(shift2),
        };
    }

    /**
     * Get Dashboard Summary
     * Quick overview for admin dashboard
     */
    async getDashboardSummary(filters?: {
        start_date?: string;
        end_date?: string;
    }) {
        let query = supabase
            .from('production_logs')
            .select(`
                actual_quantity,
                units_lost_to_cycle,
                weight_wastage_kg,
                downtime_minutes,
                flagged_for_review
            `);

        if (filters?.start_date) query = query.gte('date', filters.start_date);
        if (filters?.end_date) query = query.lte('date', filters.end_date);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        return {
            total_sessions: data?.length || 0,
            total_production: data?.reduce((sum, log) => sum + log.actual_quantity, 0) || 0,
            total_units_lost_to_cycle: data?.reduce((sum, log) => sum + (log.units_lost_to_cycle || 0), 0) || 0,
            total_weight_wastage_kg: data?.reduce((sum, log) => sum + (log.weight_wastage_kg || 0), 0) || 0,
            total_downtime_minutes: data?.reduce((sum, log) => sum + (log.downtime_minutes || 0), 0) || 0,
            flagged_sessions: data?.filter(log => log.flagged_for_review).length || 0,
        };
    }
}

export const analyticsService = new AnalyticsService();
