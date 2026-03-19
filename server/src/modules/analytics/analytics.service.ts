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
        factory_id?: string;
    }) {
        // Fetch standard production logs
        let prodQuery = supabase
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
                machines!inner(name, category, factory_id),
                products(name, size, color)
            `);

        if (filters?.start_date) prodQuery = prodQuery.gte('date', filters.start_date);
        if (filters?.end_date) prodQuery = prodQuery.lte('date', filters.end_date);
        if (filters?.machine_id) prodQuery = prodQuery.eq('machine_id', filters.machine_id);
        if (filters?.factory_id) prodQuery = prodQuery.eq('machines.factory_id', filters.factory_id);
        if (filters?.flagged_only) prodQuery = prodQuery.eq('flagged_for_review', true);

        // Fetch cap production logs
        let capQuery = supabase
            .from('cap_production_logs')
            .select(`
                id,
                date,
                shift_number,
                start_time,
                end_time,
                actual_quantity:calculated_quantity,
                actual_cycle_time_seconds,
                factory_id,
                caps!inner(name, color, ideal_cycle_time_seconds, machine_id)
            `);

        if (filters?.start_date) capQuery = capQuery.gte('date', filters.start_date);
        if (filters?.end_date) capQuery = capQuery.lte('date', filters.end_date);
        if (filters?.factory_id) capQuery = capQuery.eq('factory_id', filters.factory_id);
        if (filters?.machine_id) capQuery = capQuery.eq('caps.machine_id', filters.machine_id);

        const [prodResult, capResult] = await Promise.all([prodQuery, capQuery]);
        
        if (prodResult.error) throw new Error(prodResult.error.message);
        if (capResult.error) throw new Error(capResult.error.message);

        const prodLogs = prodResult.data || [];
        const capLogs = (capResult.data || []).map((log: any) => {
            // Calculate production time in minutes from start/end times
            let productionTimeMinutes = 0;
            if (log.start_time && log.end_time) {
                const [startH, startM] = log.start_time.split(':').map(Number);
                const [endH, endM] = log.end_time.split(':').map(Number);
                
                let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
                if (diffMinutes < 0) diffMinutes += 24 * 60; // Handle midnight cross
                
                productionTimeMinutes = diffMinutes;
            } else {
                productionTimeMinutes = 12 * 60; // Fallback
            }
            
            // downtime_minutes not in cap logs
            productionTimeMinutes = productionTimeMinutes - 0;
            
            const cap = log.caps;
            const idealCycleTime = cap?.ideal_cycle_time_seconds || 0;
            const cavities = 1;
            
            let theoreticalQuantity = 0;
            if (idealCycleTime > 0) {
                theoreticalQuantity = Math.floor((productionTimeMinutes * 60) / (idealCycleTime / cavities));
            }
            
            const unitsLost = Math.max(0, theoreticalQuantity - log.actual_quantity);
            const flagged = idealCycleTime > 0 && log.actual_cycle_time_seconds > (idealCycleTime * 1.05);

            return {
                id: log.id,
                date: log.date,
                shift_number: log.shift_number,
                start_time: log.start_time,
                end_time: log.end_time,
                actual_quantity: log.actual_quantity || 0,
                actual_cycle_time_seconds: log.actual_cycle_time_seconds,
                units_lost_to_cycle: unitsLost,
                flagged_for_review: flagged,
                machines: null,
                products: {
                    name: cap?.name,
                    size: 'Cap',
                    color: cap?.color
                }
            };
        });

        const allLogs = [...prodLogs, ...capLogs]
            .filter(log => !filters?.flagged_only || log.flagged_for_review)
            .sort((a, b) => (b.units_lost_to_cycle || 0) - (a.units_lost_to_cycle || 0));

        return {
            total_sessions: allLogs.length,
            total_units_lost: allLogs.reduce((sum, log) => sum + (log.units_lost_to_cycle || 0), 0),
            flagged_sessions: allLogs.filter(log => log.flagged_for_review).length,
            sessions: allLogs,
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
        factory_id?: string;
    }) {
        let prodQuery = supabase
            .from('production_logs')
            .select(`
                id,
                date,
                shift_number,
                actual_quantity,
                actual_weight_grams,
                weight_wastage_kg,
                machines!inner(name, factory_id),
                products(name, size, color, weight_grams)
            `)
            .order('weight_wastage_kg', { ascending: false });

        if (filters?.start_date) prodQuery = prodQuery.gte('date', filters.start_date);
        if (filters?.end_date) prodQuery = prodQuery.lte('date', filters.end_date);
        if (filters?.product_id) prodQuery = prodQuery.eq('product_id', filters.product_id);
        if (filters?.factory_id) prodQuery = prodQuery.eq('machines.factory_id', filters.factory_id);

        let capQuery = supabase
            .from('cap_production_logs')
            .select(`
                id,
                date,
                shift_number,
                actual_quantity:calculated_quantity,
                factory_id,
                caps:cap_id(name, color, ideal_weight_grams)
            `);

        if (filters?.start_date) capQuery = capQuery.gte('date', filters.start_date);
        if (filters?.end_date) capQuery = capQuery.lte('date', filters.end_date);
        if (filters?.factory_id) capQuery = capQuery.eq('factory_id', filters.factory_id);

        const [prodResult, capResult] = await Promise.all([prodQuery, capQuery]);
        if (prodResult.error) throw new Error(prodResult.error.message);
        if (capResult.error) throw new Error(capResult.error.message);

        const prodLogs = prodResult.data || [];
        const capLogs = (capResult.data || []).map((log: any) => ({
            id: log.id,
            date: log.date,
            shift_number: log.shift_number,
            actual_quantity: log.actual_quantity,
            actual_weight_grams: 0, // No weight tracking for caps yet
            weight_wastage_kg: 0,
            machines: log.machines,
            products: {
                name: log.caps?.name,
                size: 'Cap',
                color: log.caps?.color,
                weight_grams: log.caps?.weight_grams
            }
        }));

        const allLogs = [...prodLogs, ...capLogs]
            .sort((a, b) => (b.weight_wastage_kg || 0) - (a.weight_wastage_kg || 0));

        return {
            total_wastage_kg: allLogs.reduce((sum, log) => sum + (log.weight_wastage_kg || 0), 0),
            sessions: allLogs,
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
        factory_id?: string;
    }) {
        const fetchFromTable = async (table: string) => {
            const hasMachine = table === 'production_logs';
            let query = supabase
                .from(table)
                .select(`
                    downtime_minutes,
                    downtime_reason,
                    date,
                    shift_number
                    ${hasMachine ? ', machines!inner(name, factory_id)' : ', factory_id'}
                `)
                .gt('downtime_minutes', 0);

            if (filters?.start_date) query = query.gte('date', filters.start_date);
            if (filters?.end_date) query = query.lte('date', filters.end_date);
            if (filters?.machine_id && hasMachine) query = query.eq('machine_id', filters.machine_id);
            if (filters?.factory_id) {
                if (hasMachine) {
                    query = query.eq('machines.factory_id', filters.factory_id);
                } else {
                    query = query.eq('factory_id', filters.factory_id);
                }
            }

            const { data, error } = await query;
            if (error) throw new Error(error.message);
            return data || [];
        };

        const [prodLogs] = await Promise.all([
            fetchFromTable('production_logs')
        ]);

        const capLogs: any[] = []; // cap_production_logs doesn't have downtime columns yet
        const allLogs = [...prodLogs, ...capLogs];

        // Group by reason
        const breakdown = allLogs.reduce((acc: any, log: any) => {
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
            total_downtime_minutes: allLogs.reduce((sum, log) => sum + (log.downtime_minutes || 0), 0),
            breakdown: Object.values(breakdown || {}),
            sessions: allLogs,
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
        factory_id?: string;
    }) {
        const prodQuery = supabase
            .from('production_logs')
            .select(`
                date,
                start_time,
                end_time,
                shift_number,
                efficiency_percentage,
                actual_quantity,
                theoretical_quantity,
                machine_id,
                machines!inner(name, category, factory_id)
            `)
            .order('date', { ascending: true });

        const capQuery = supabase
            .from('cap_production_logs')
            .select(`
                id,
                date,
                start_time,
                end_time,
                shift_number,
                actual_quantity:calculated_quantity,
                actual_cycle_time_seconds,
                factory_id,
                caps!inner(ideal_cycle_time_seconds, machine_id, machines(name, category, factory_id))
            `)
            .order('date', { ascending: true });

        if (filters?.start_date) {
            prodQuery.gte('date', filters.start_date);
            capQuery.gte('date', filters.start_date);
        }
        if (filters?.end_date) {
            prodQuery.lte('date', filters.end_date);
            capQuery.lte('date', filters.end_date);
        }
        if (filters?.machine_id) {
            prodQuery.eq('machine_id', filters.machine_id);
            capQuery.eq('caps.machine_id', filters.machine_id);
        }
        if (filters?.factory_id) {
            prodQuery.eq('machines.factory_id', filters.factory_id);
            capQuery.eq('caps.machines.factory_id', filters.factory_id);
        }

        const [prodResult, capResult] = await Promise.all([prodQuery, capQuery]);
        if (prodResult.error) throw new Error(prodResult.error.message);
        if (capResult.error) throw new Error(capResult.error.message);

        const prodLogs = prodResult.data || [];
        const capLogs = (capResult.data || []).map((log: any) => {
            let productionTimeMinutes = 0;
            if (log.start_time && log.end_time) {
                const [startH, startM] = log.start_time.split(':').map(Number);
                const [endH, endM] = log.end_time.split(':').map(Number);
                let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
                if (diffMinutes < 0) diffMinutes += 24 * 60;
                productionTimeMinutes = diffMinutes;
            } else {
                productionTimeMinutes = 12 * 60;
            }
            const actualProductionTime = productionTimeMinutes - 0;
            const idealCycleTime = log.caps?.ideal_cycle_time_seconds || 0;
            const cavities = 1;

            let theoreticalQuantity = 0;
            let efficiency = 0;

            if (idealCycleTime > 0) {
                theoreticalQuantity = Math.floor((productionTimeMinutes * 60) / (idealCycleTime / cavities));
                if (theoreticalQuantity > 0) {
                    efficiency = Math.min(100, Number(((log.actual_quantity / theoreticalQuantity) * 100).toFixed(2)));
                }
            }

            return {
                date: log.date,
                shift_number: log.shift_number,
                efficiency_percentage: efficiency,
                actual_quantity: log.actual_quantity,
                theoretical_quantity: theoreticalQuantity,
                machine_id: log.machine_id || log.caps?.machine_id,
                machines: log.machines || log.caps?.machines
            };
        });

        const allLogs = [...prodLogs, ...capLogs];

        // Group by machine
        const byMachine = allLogs.reduce((acc: any, log: any) => {
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
        factory_id?: string;
    }) {
        const prodQuery = supabase
            .from('production_logs')
            .select(`
                shift_number,
                start_time,
                end_time,
                efficiency_percentage,
                actual_quantity,
                units_lost_to_cycle,
                downtime_minutes,
                weight_wastage_kg,
                machines!inner(factory_id)
            `);

        const capQuery = supabase
            .from('cap_production_logs')
            .select(`
                id,
                shift_number,
                start_time,
                end_time,
                actual_quantity:calculated_quantity,
                actual_cycle_time_seconds,
                factory_id,
                caps:cap_id(ideal_cycle_time_seconds)
            `);

        if (filters?.start_date) {
            prodQuery.gte('date', filters.start_date);
            capQuery.gte('date', filters.start_date);
        }
        if (filters?.end_date) {
            prodQuery.lte('date', filters.end_date);
            capQuery.lte('date', filters.end_date);
        }
        if (filters?.factory_id) {
            prodQuery.eq('machines.factory_id', filters.factory_id);
            capQuery.eq('factory_id', filters.factory_id);
        }

        const [prodResult, capResult] = await Promise.all([prodQuery, capQuery]);
        if (prodResult.error) throw new Error(prodResult.error.message);
        if (capResult.error) throw new Error(capResult.error.message);

        const prodLogs = prodResult.data || [];
        const capLogs = (capResult.data || []).map((log: any) => {
            let productionTimeMinutes = 0;
            if (log.start_time && log.end_time) {
                const [startH, startM] = log.start_time.split(':').map(Number);
                const [endH, endM] = log.end_time.split(':').map(Number);
                let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
                if (diffMinutes < 0) diffMinutes += 24 * 60;
                productionTimeMinutes = diffMinutes;
            } else {
                productionTimeMinutes = 12 * 60;
            }
            const actualProductionTime = productionTimeMinutes - 0;
            const idealCycleTime = log.caps?.ideal_cycle_time_seconds || 0;
            const cavities = 1;

            let theoreticalQuantity = 0;
            let efficiency = 0;
            if (idealCycleTime > 0) {
                theoreticalQuantity = Math.floor((productionTimeMinutes * 60) / (idealCycleTime / cavities));
                efficiency = theoreticalQuantity > 0 ? (log.actual_quantity / theoreticalQuantity) * 100 : 0;
            }

            return {
                shift_number: log.shift_number,
                efficiency_percentage: efficiency,
                actual_quantity: log.actual_quantity || 0,
                units_lost_to_cycle: Math.max(0, theoreticalQuantity - (log.actual_quantity || 0)),
                downtime_minutes: 0,
                weight_wastage_kg: 0,
            };
        });

        const allLogs = [...prodLogs, ...capLogs];

        const shift1 = allLogs.filter(log => log.shift_number === 1);
        const shift2 = allLogs.filter(log => log.shift_number === 2);

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
        factory_id?: string;
    }) {
        const prodQuery = supabase
            .from('production_logs')
            .select(`
                actual_quantity,
                start_time,
                end_time,
                units_lost_to_cycle,
                weight_wastage_kg,
                downtime_minutes,
                flagged_for_review,
                machines!inner(factory_id)
            `);

        const capQuery = supabase
            .from('cap_production_logs')
            .select(`
                start_time,
                end_time,
                actual_quantity:calculated_quantity,
                actual_cycle_time_seconds,
                factory_id,
                caps:cap_id(ideal_cycle_time_seconds)
            `);

        if (filters?.start_date) {
            prodQuery.gte('date', filters.start_date);
            capQuery.gte('date', filters.start_date);
        }
        if (filters?.end_date) {
            prodQuery.lte('date', filters.end_date);
            capQuery.lte('date', filters.end_date);
        }
        if (filters?.factory_id) {
            prodQuery.eq('machines.factory_id', filters.factory_id);
            capQuery.eq('factory_id', filters.factory_id);
        }

        const [prodResult, capResult] = await Promise.all([prodQuery, capQuery]);
        if (prodResult.error) throw new Error(prodResult.error.message);
        if (capResult.error) throw new Error(capResult.error.message);

        const prodLogs = prodResult.data || [];
        const capLogs = (capResult.data || []).map((log: any) => {
            let productionTimeMinutes = 0;
            if (log.start_time && log.end_time) {
                const [startH, startM] = log.start_time.split(':').map(Number);
                const [endH, endM] = log.end_time.split(':').map(Number);
                let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
                if (diffMinutes < 0) diffMinutes += 24 * 60;
                productionTimeMinutes = diffMinutes;
            } else {
                productionTimeMinutes = 12 * 60;
            }
            const actualProductionTime = productionTimeMinutes - 0;
            const idealCycleTime = log.caps?.ideal_cycle_time_seconds || 0;
            const cavities = 1;

            let theoreticalQuantity = 0;
            if (idealCycleTime > 0) {
                theoreticalQuantity = Math.floor((productionTimeMinutes * 60) / (idealCycleTime / cavities));
            }

            return {
                actual_quantity: log.actual_quantity || 0,
                units_lost_to_cycle: Math.max(0, theoreticalQuantity - (log.actual_quantity || 0)),
                weight_wastage_kg: 0,
                downtime_minutes: 0,
                flagged_for_review: idealCycleTime > 0 && log.actual_cycle_time_seconds > (idealCycleTime * 1.05)
            };
        });

        const allLogs = [...prodLogs, ...capLogs];

        return {
            total_sessions: allLogs.length,
            total_production: allLogs.reduce((sum, log) => sum + log.actual_quantity, 0),
            total_units_lost_to_cycle: allLogs.reduce((sum, log) => sum + (log.units_lost_to_cycle || 0), 0),
            total_weight_wastage_kg: allLogs.reduce((sum, log) => sum + (log.weight_wastage_kg || 0), 0),
            total_downtime_minutes: allLogs.reduce((sum, log) => sum + (log.downtime_minutes || 0), 0),
            flagged_sessions: allLogs.filter(log => log.flagged_for_review).length,
        };
    }
}

export const analyticsService = new AnalyticsService();
