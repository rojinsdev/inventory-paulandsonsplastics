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
                downtime_minutes,
                machine_id,
                caps!inner(
                    name, 
                    color, 
                    template:template_id(
                        id, 
                        name,
                        machine_cap_templates(ideal_cycle_time_seconds, machine_id)
                    )
                ),
                machine:machines(name)
            `);

        if (filters?.start_date) capQuery = capQuery.gte('date', filters.start_date);
        if (filters?.end_date) capQuery = capQuery.lte('date', filters.end_date);
        if (filters?.factory_id) capQuery = capQuery.eq('factory_id', filters.factory_id);
        if (filters?.machine_id) capQuery = capQuery.eq('caps.machine_id', filters.machine_id);

        // Fetch inner production logs
        let innerQuery = supabase
            .from('inner_production_logs')
            .select(`
                id,
                date,
                shift_number,
                start_time,
                end_time,
                actual_quantity:calculated_quantity,
                actual_cycle_time_seconds,
                factory_id,
                downtime_minutes,
                inners!inner(
                    color, 
                    inner_templates:template_id(
                        name, 
                        ideal_cycle_time_seconds
                    )
                ),
                machine:machines(name)
            `);

        if (filters?.start_date) innerQuery = innerQuery.gte('date', filters.start_date);
        if (filters?.end_date) innerQuery = innerQuery.lte('date', filters.end_date);
        if (filters?.factory_id) innerQuery = innerQuery.eq('factory_id', filters.factory_id);
        if (filters?.machine_id) innerQuery = innerQuery.eq('inners.machine_id', filters.machine_id);

        const [prodResult, capResult, innerResult] = await Promise.all([prodQuery, capQuery, innerQuery]);
        
        if (prodResult.error) throw new Error(prodResult.error.message);
        if (capResult.error) throw new Error(capResult.error.message);
        if (innerResult.error) throw new Error(innerResult.error.message);

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
            
            // Handle actual downtime if available
            productionTimeMinutes = productionTimeMinutes - (log.downtime_minutes || 0);
            
            const cap = log.caps;
            const template = cap?.template;
            const machineMappings = template?.machine_cap_templates || [];
            const mapping = Array.isArray(machineMappings) 
                ? machineMappings.find((m: any) => m.machine_id === log.machine_id)
                : machineMappings;
                
            const idealCycleTime = mapping?.ideal_cycle_time_seconds || 0;
            const actualCycleTime = log.actual_cycle_time_seconds || 0;
            const cavities = 1;
            
            let theoreticalQuantity = 0;
            if (idealCycleTime > 0) {
                theoreticalQuantity = Math.floor((productionTimeMinutes * 60) / (Number(idealCycleTime) / cavities));
            }
            
            const unitsLost = Math.max(0, theoreticalQuantity - (log.actual_quantity || 0));
            const flagged = idealCycleTime > 0 && actualCycleTime > (Number(idealCycleTime) * 1.05);

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
                machines: log.caps?.machines,
                products: {
                    name: cap?.name,
                    size: 'Cap',
                    color: cap?.color
                }
            };
        });

        const innerLogs = (innerResult.data || []).map((log: any) => {
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
            
            productionTimeMinutes = productionTimeMinutes - (log.downtime_minutes || 0);
            
            const inner = log.inners;
            const template = inner?.inner_templates;
            const idealCycleTime = template?.ideal_cycle_time_seconds || 0;
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
                machines: log.inners?.inner_templates?.machines,
                products: {
                    name: template?.name,
                    size: 'Inner',
                    color: inner?.color
                }
            };
        });

        const allLogs = [...prodLogs, ...capLogs, ...innerLogs]
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
                products(
                    name, 
                    size, 
                    color, 
                    weight_grams,
                    raw_materials(last_cost_per_kg)
                )
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
                weight_wastage_kg,
                factory_id,
                caps!inner(
                    name, 
                    color, 
                    weight_grams:ideal_weight_grams, 
                    raw_materials:raw_material_id(last_cost_per_kg)
                ),
                machine:machines(name)
            `);

        if (filters?.start_date) capQuery = capQuery.gte('date', filters.start_date);
        if (filters?.end_date) capQuery = capQuery.lte('date', filters.end_date);
        if (filters?.factory_id) capQuery = capQuery.eq('factory_id', filters.factory_id);

        let innerQuery = supabase
            .from('inner_production_logs')
            .select(`
                id,
                date,
                shift_number,
                actual_quantity:calculated_quantity,
                weight_wastage_kg,
                factory_id,
                inners:inner_id(
                    color,
                    template:template_id(
                        name,
                        weight_grams:ideal_weight_grams,
                        raw_materials:raw_material_id(last_cost_per_kg)
                    )
                ),
                machine:machines(name)
            `);

        if (filters?.start_date) innerQuery = innerQuery.gte('date', filters.start_date);
        if (filters?.end_date) innerQuery = innerQuery.lte('date', filters.end_date);
        if (filters?.factory_id) innerQuery = innerQuery.eq('factory_id', filters.factory_id);

        const [prodResult, capResult, innerResult] = await Promise.all([prodQuery, capQuery, innerQuery]);
        if (prodResult.error) throw new Error(prodResult.error.message);
        if (capResult.error) throw new Error(capResult.error.message);
        if (innerResult.error) throw new Error(innerResult.error.message);

        const prodLogs = (prodResult.data || []).map((log: any) => ({
            ...log,
            financial_loss: (log.weight_wastage_kg || 0) * (log.products?.raw_materials?.last_cost_per_kg || 0)
        }));

        const capLogs = (capResult.data || []).map((log: any) => {
            const materials = (log as any).caps?.raw_materials;
            const lastCost = (Array.isArray(materials) ? materials[0]?.last_cost_per_kg : materials?.last_cost_per_kg) || 0;
            const wastage = log.weight_wastage_kg || 0;
            return {
                id: log.id,
                date: log.date,
                shift_number: log.shift_number,
                actual_quantity: log.actual_quantity,
                actual_weight_grams: 0,
                weight_wastage_kg: wastage, 
                financial_loss: wastage * lastCost,
                machines: log.machine,
                products: {
                    name: log.caps?.name,
                    size: 'Cap',
                    color: log.caps?.color,
                    weight_grams: log.caps?.weight_grams
                }
            };
        });

        const innerLogs = (innerResult.data || []).map((log: any) => {
            const inner = log.inners;
            const template = inner?.template;
            const materials = template?.raw_materials;
            const lastCost = (Array.isArray(materials) ? materials[0]?.last_cost_per_kg : materials?.last_cost_per_kg) || 0;
            
            return {
                id: log.id,
                date: log.date,
                shift_number: log.shift_number,
                actual_quantity: log.actual_quantity,
                actual_weight_grams: 0,
                weight_wastage_kg: log.weight_wastage_kg || 0,
                financial_loss: (log.weight_wastage_kg || 0) * lastCost,
                machines: log.machine,
                products: {
                    name: template?.name,
                    size: 'Inner',
                    color: inner?.color,
                    weight_grams: template?.weight_grams
                }
            };
        });

        const allLogs = [...prodLogs, ...capLogs, ...innerLogs]
            .sort((a, b) => (b.weight_wastage_kg || 0) - (a.weight_wastage_kg || 0));

        return {
            total_wastage_kg: allLogs.reduce((sum, log) => sum + (log.weight_wastage_kg || 0), 0),
            total_financial_loss: allLogs.reduce((sum, log) => sum + (log.financial_loss || 0), 0),
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
            const isProd = table === 'production_logs';
            let query = supabase
                .from(table)
                .select(`
                    downtime_minutes,
                    downtime_reason,
                    date,
                    shift_number
                    ${isProd ? ', machines!inner(name, factory_id)' : ', factory_id'}
                `)
                .gt('downtime_minutes', 0);

            if (filters?.start_date) query = query.gte('date', filters.start_date);
            if (filters?.end_date) query = query.lte('date', filters.end_date);
            if (filters?.machine_id && isProd) query = query.eq('machine_id', filters.machine_id);
            if (filters?.factory_id) {
                if (isProd) query = query.eq('machines.factory_id', filters.factory_id);
                else query = query.eq('factory_id', filters.factory_id);
            }

            const { data, error } = await query;
            if (error) throw new Error(error.message);
            return data || [];
        };

        const [prodLogs, capLogs, innerLogs] = await Promise.all([
            fetchFromTable('production_logs'),
            fetchFromTable('cap_production_logs'),
            fetchFromTable('inner_production_logs')
        ]);

        const allLogs = [...prodLogs, ...capLogs, ...innerLogs];

        const breakdown: Record<string, any> = {};
        allLogs.forEach((log: any) => {
            const reason = log.downtime_reason || 'Unspecified';
            if (!breakdown[reason]) {
                breakdown[reason] = {
                    reason,
                    total_minutes: 0,
                    occurrences: 0,
                };
            }
            breakdown[reason].total_minutes += (log.downtime_minutes || 0);
            breakdown[reason].occurrences += 1;
        });

        const totalMinutes = allLogs.reduce((sum, log) => sum + (log.downtime_minutes || 0), 0);

        return {
            total_downtime_minutes: totalMinutes,
            breakdown: Object.values(breakdown).map((b: any) => ({
                ...b,
                percentage: totalMinutes > 0 ? Number(((b.total_minutes / totalMinutes) * 100).toFixed(1)) : 0
            })).sort((a, b) => b.total_minutes - a.total_minutes),
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
                downtime_minutes,
                machine_id,
                caps:cap_id(
                    name, 
                    color, 
                    template:template_id(
                        id, 
                        name,
                        machine_cap_templates(ideal_cycle_time_seconds, machine_id)
                    )
                ),
                machine:machines(name, category, factory_id)
            `);

        const innerQuery = supabase
            .from('inner_production_logs')
            .select(`
                id,
                date,
                start_time,
                end_time,
                shift_number,
                actual_quantity:calculated_quantity,
                actual_cycle_time_seconds,
                factory_id,
                downtime_minutes,
                inners!inner(ideal_cycle_time_seconds, inner_templates(name, machines(name, category, factory_id)))
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
            innerQuery.eq('inners.machines.factory_id', filters.factory_id);
        }

        const [prodResult, capResult, innerResult] = await Promise.all([prodQuery, capQuery, innerQuery]);
        if (prodResult.error) throw new Error(prodResult.error.message);
        if (capResult.error) throw new Error(capResult.error.message);
        if (innerResult.error) throw new Error(innerResult.error.message);

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
            const actualProductionTime = productionTimeMinutes - (log.downtime_minutes || 0);
            
            const cap = log.caps;
            const template = cap?.template;
            const machineMappings = template?.machine_cap_templates || [];
            const mapping = Array.isArray(machineMappings) 
                ? machineMappings.find((m: any) => m.machine_id === log.machine_id)
                : machineMappings;
            
            const idealCycleTime = mapping?.ideal_cycle_time_seconds || 0;
            const cavities = 1;

            let theoreticalQuantity = 0;
            let efficiency = 0;

            if (idealCycleTime > 0) {
                theoreticalQuantity = Math.floor((actualProductionTime * 60) / (Number(idealCycleTime) / cavities));
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

        const innerLogs = (innerResult.data || []).map((log: any) => {
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
            const actualProductionTime = productionTimeMinutes - (log.downtime_minutes || 0);
            const inner = log.inners;
            const innerTemplate = inner?.inner_templates;
            const idealCycleTime = inner?.ideal_cycle_time_seconds || 0;
            const cavities = 1;

            let theoreticalQuantity = 0;
            let efficiency = 0;

            if (idealCycleTime > 0) {
                theoreticalQuantity = Math.floor((actualProductionTime * 60) / (idealCycleTime / cavities));
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
                machine_id: log.machine_id || innerTemplate?.machine_id,
                machines: innerTemplate?.machines
            };
        });

        const allLogs = [...prodLogs, ...capLogs, ...innerLogs];

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
        const fetchShiftStats = async (table: string) => {
            const isProd = table === 'production_logs';

            let query = supabase
                .from(table)
                .select(`
                    shift_number,
                    actual_quantity${isProd ? '' : ':calculated_quantity'},
                    weight_wastage_kg,
                    downtime_minutes,
                    ${isProd ? 'machines!inner(factory_id)' : 'factory_id'}
                `);

            if (filters?.start_date) query = query.gte('date', filters.start_date);
            if (filters?.end_date) query = query.lte('date', filters.end_date);
            if (filters?.factory_id) {
                if (isProd) query = query.eq('machines.factory_id', filters.factory_id);
                else query = query.eq('factory_id', filters.factory_id);
            }

            const { data, error } = await query;
            if (error) throw new Error(error.message);
            
            return data || [];
        };

        const [prodLogs, capLogs, innerLogs] = await Promise.all([
            fetchShiftStats('production_logs'),
            fetchShiftStats('cap_production_logs'),
            fetchShiftStats('inner_production_logs')
        ]);

        const allLogs = [
            ...(prodLogs || []),
            ...(capLogs || []),
            ...(innerLogs || [])
        ];

        const calculateShiftStats = (shiftNum: number) => {
            const shiftLogs = allLogs.filter(log => log.shift_number === shiftNum);
            return {
                sessions: shiftLogs.length,
                total_production: shiftLogs.reduce((sum, log) => sum + (log.actual_quantity || 0), 0),
                total_wastage: shiftLogs.reduce((sum, log) => sum + (log.weight_wastage_kg || 0), 0),
                total_downtime: shiftLogs.reduce((sum, log) => sum + (log.downtime_minutes || 0), 0)
            };
        };

        return {
            shift_1: calculateShiftStats(1),
            shift_2: calculateShiftStats(2)
        };
    }

    /**
     * Get Action Required Entries
     * Identified sessions that need manager review
     */
    async getActionRequiredEntries(filters?: {
        factory_id?: string;
        machine_id?: string;
    }) {
        const { data: prodLogs, error } = await supabase
            .from('production_logs')
            .select(`
                id,
                date,
                shift_number,
                actual_quantity,
                weight_wastage_kg,
                efficiency_percentage,
                flagged_for_review,
                machines!inner(name, factory_id),
                products(name)
            `)
            .or('flagged_for_review.eq.true,weight_wastage_kg.gt.5,efficiency_percentage.lt.70')
            .limit(10);

        if (error) throw new Error(error.message);

        return (prodLogs || []).map((log: any) => {
            const m = log.machines;
            const p = log.products;
            
            return {
                id: log.id,
                date: log.date,
                machine_name: (Array.isArray(m) ? m[0]?.name : m?.name) || 'Unknown Machine',
                product_name: (Array.isArray(p) ? p[0]?.name : p?.name) || 'Unknown Product',
                reason: log.flagged_for_review 
                ? 'Flagged by operator' 
                : log.weight_wastage_kg > 5 
                    ? 'High wastage' 
                    : 'Low efficiency',
                severity: (log.weight_wastage_kg > 10 || log.efficiency_percentage < 50) ? 'high' : 'medium'
            };
        });
    }

    /**
     * Get Dashboard Summary
     * Quick overview for admin dashboard
     */
    private async calculatePeriodStats(filters?: {
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
                machines!inner(factory_id),
                products(
                    raw_materials(last_cost_per_kg)
                )
            `);

        const capQuery = supabase
            .from('cap_production_logs')
            .select(`
                start_time,
                end_time,
                actual_quantity:calculated_quantity,
                actual_cycle_time_seconds,
                factory_id,
                downtime_minutes,
                weight_wastage_kg,
                machine_id,
                caps:cap_id(
                    id,
                    template:template_id(
                        id,
                        machine_cap_templates(ideal_cycle_time_seconds, machine_id)
                    ),
                    raw_materials:raw_material_id(last_cost_per_kg)
                )
            `);

        const innerQuery = supabase
            .from('inner_production_logs')
            .select(`
                start_time,
                end_time,
                actual_quantity:calculated_quantity,
                actual_cycle_time_seconds,
                factory_id,
                downtime_minutes,
                weight_wastage_kg,
                inners:inner_id(
                    inner_templates:template_id(
                        name,
                        ideal_cycle_time_seconds,
                        raw_materials:raw_material_id(last_cost_per_kg)
                    )
                ),
                machine:machines(name)
            `);

        if (filters?.start_date) {
            prodQuery.gte('date', filters.start_date);
            capQuery.gte('date', filters.start_date);
            innerQuery.gte('date', filters.start_date);
        }
        if (filters?.end_date) {
            prodQuery.lte('date', filters.end_date);
            capQuery.lte('date', filters.end_date);
            innerQuery.lte('date', filters.end_date);
        }
        if (filters?.factory_id) {
            prodQuery.eq('machines.factory_id', filters.factory_id);
            capQuery.eq('factory_id', filters.factory_id);
            innerQuery.eq('factory_id', filters.factory_id);
        }

        const [prodResult, capResult, innerResult] = await Promise.all([prodQuery, capQuery, innerQuery]);
        if (prodResult.error) throw new Error(prodResult.error.message);
        if (capResult.error) throw new Error(capResult.error.message);
        if (innerResult.error) throw new Error(innerResult.error.message);

        const calculateLogStats = (log: any, prodType: 'standard' | 'cap' | 'inner') => {
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

            // Extract nested product info based on type
            let product = null;
            let idealCycleTime = 0;
            let lastCostPerKg = 0;

            if (prodType === 'standard') {
                product = log.products;
                idealCycleTime = product?.ideal_cycle_time_seconds || 0;
                const materials = product?.raw_materials;
                lastCostPerKg = (Array.isArray(materials) ? materials[0]?.last_cost_per_kg : materials?.last_cost_per_kg) || 0;
            } else if (prodType === 'cap') {
                product = Array.isArray(log.caps) ? log.caps[0] : log.caps;
                const template = product?.template;
                const machineMappings = template?.machine_cap_templates || [];
                const mapping = Array.isArray(machineMappings) 
                    ? machineMappings.find((m: any) => m.machine_id === log.machine_id)
                    : machineMappings;
                
                idealCycleTime = Number(mapping?.ideal_cycle_time_seconds) || 0;
                const materials = product?.raw_materials;
                lastCostPerKg = (Array.isArray(materials) ? materials[0]?.last_cost_per_kg : materials?.last_cost_per_kg) || 0;
            } else if (prodType === 'inner') {
                const inner = Array.isArray(log.inners) ? log.inners[0] : log.inners;
                product = inner?.inner_templates;
                idealCycleTime = Number(product?.ideal_cycle_time_seconds) || 0;
                const materials = product?.raw_materials;
                lastCostPerKg = (Array.isArray(materials) ? materials[0]?.last_cost_per_kg : materials?.last_cost_per_kg) || 0;
            }

            const actualCycleTime = log.actual_cycle_time_seconds || 0;
            const actualProductionTime = productionTimeMinutes - (log.downtime_minutes || 0);
            let theoreticalQuantity = 0;
            if (idealCycleTime > 0) {
                theoreticalQuantity = Math.floor((actualProductionTime * 60) / idealCycleTime);
            }

            const wastage = log.weight_wastage_kg || 0;

            return {
                actual_quantity: log.actual_quantity || 0,
                units_lost_to_cycle: Math.max(0, theoreticalQuantity - (log.actual_quantity || 0)),
                weight_wastage_kg: wastage,
                downtime_minutes: log.downtime_minutes || 0,
                flagged_for_review: log.flagged_for_review || (idealCycleTime > 0 && actualCycleTime > (idealCycleTime * 1.05)),
                financial_loss: wastage * (lastCostPerKg || 0)
            };
        };

        const allLogs = [
            ...(prodResult.data || []).map(log => calculateLogStats(log, 'standard')),
            ...(capResult.data || []).map(log => calculateLogStats(log, 'cap')),
            ...(innerResult.data || []).map(log => calculateLogStats(log, 'inner'))
        ];

        return {
            total_sessions: allLogs.length,
            total_production: allLogs.reduce((sum, log) => sum + log.actual_quantity, 0),
            total_units_lost_to_cycle: allLogs.reduce((sum, log) => sum + (log.units_lost_to_cycle || 0), 0),
            total_weight_wastage_kg: allLogs.reduce((sum, log) => sum + (log.weight_wastage_kg || 0), 0),
            total_financial_loss: allLogs.reduce((sum, log) => sum + (log.financial_loss || 0), 0),
            total_downtime_minutes: allLogs.reduce((sum, log) => sum + (log.downtime_minutes || 0), 0),
            flagged_sessions: allLogs.filter(log => log.flagged_for_review).length,
        };
    }

    async getDashboardSummary(filters?: {
        start_date?: string;
        end_date?: string;
        factory_id?: string;
    }) {
        const currentStats = await this.calculatePeriodStats(filters);

        // Previous period trend calculation
        let trends = {};
        if (filters?.start_date && filters?.end_date) {
            const start = new Date(filters.start_date);
            const end = new Date(filters.end_date);
            const durationMs = end.getTime() - start.getTime();
            
            const prevStart = new Date(start.getTime() - durationMs - 86400000); // subtract duration + 1 day
            const prevEnd = new Date(start.getTime() - 86400000);

            const prevFilters = {
                ...filters,
                start_date: prevStart.toISOString().split('T')[0],
                end_date: prevEnd.toISOString().split('T')[0]
            };

            const prevStats = await this.calculatePeriodStats(prevFilters);

            const calculateTrend = (curr: number, prev: number, inverse = false) => {
                if (prev === 0) return { value: 0, direction: 'neutral' };
                const pct = ((curr - prev) / prev) * 100;
                let direction: 'up' | 'down' | 'neutral' = 'neutral';
                if (pct > 0.5) direction = 'up';
                else if (pct < -0.5) direction = 'down';

                return {
                    value: Math.abs(Number(pct.toFixed(1))),
                    direction,
                    is_improvement: inverse ? direction === 'down' : direction === 'up'
                };
            };

            trends = {
                production: calculateTrend(currentStats.total_production, prevStats.total_production),
                wastage: calculateTrend(currentStats.total_weight_wastage_kg, prevStats.total_weight_wastage_kg, true),
                downtime: calculateTrend(currentStats.total_downtime_minutes, prevStats.total_downtime_minutes, true),
                efficiency_loss: calculateTrend(currentStats.total_units_lost_to_cycle, prevStats.total_units_lost_to_cycle, true),
                financial_loss: calculateTrend(currentStats.total_financial_loss, prevStats.total_financial_loss, true)
            };
        }

        return {
            ...currentStats,
            trends
        };
    }

}

export const analyticsService = new AnalyticsService();
