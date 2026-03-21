import { supabase } from '../../config/supabase';
import { AppError } from '../../utils/AppError';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { stockAllocationService } from '../inventory/stock-allocation.service';
import { inventoryService } from '../inventory/inventory.service';
import { getPagination } from '../../utils/supabase';
import logger from '../../utils/logger';

const auditService = new AuditService();
const MAIN_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';

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

    // Actual metrics (Optional for robustness)
    actual_cycle_time_seconds?: number; // NEW: From machine display
    actual_weight_grams?: number; // NEW: Measured weight per unit

    // Downtime
    downtime_minutes?: number; // NEW: Calculated or manual
    downtime_reason?: string; // NEW: Required if > 30 mins

    user_id: string;
}

export interface SubmitCapProductionDTO {
    cap_id: string;
    factory_id?: string; // Optional: Server will default to MAIN_FACTORY_ID
    date: string;
    shift_number: number;
    start_time: string;
    end_time: string;
    total_weight_produced_kg?: number; // Optional if total_produced is provided
    total_produced?: number; // Optional if total_weight_produced_kg is provided
    actual_cycle_time_seconds?: number; // Optional
    actual_weight_grams?: number; // Optional
    remarks?: string;
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
            throw new AppError('Invalid shift times: end_time must be after start_time', 400);
        }

        // 2. Check for overlapping sessions (same machine, same date, overlapping times)
        await this.validateNoOverlap(data.machine_id, productionDate, data.shift_number, data.start_time, data.end_time);

        // 3. Get Machine Config
        const { data: machine, error: machineError } = await supabase
            .from('machines')
            .select('daily_running_cost, status, factory_id')
            .eq('id', data.machine_id)
            .single();

        if (machineError || !machine || machine.status !== 'active') {
            throw new AppError('Invalid or inactive machine', 400);
        }

        // 4. Get Product and counting method + joined template info
        const { data: product, error: productError } = await supabase
            .from('products')
            .select(`
                id, color, selling_price, weight_grams, status, counting_method, raw_material_id, factory_id, template_id,
                product_templates(cap_template_id)
            `)
            .eq('id', data.product_id)
            .single();

        if (productError || !product || product.status !== 'active') {
            throw new AppError('Invalid or inactive product', 400);
        }

        // 5. Validate Factory Match
        const factoryId = machine.factory_id || product.factory_id || MAIN_FACTORY_ID;
        if (machine.factory_id && product.factory_id && machine.factory_id !== product.factory_id) {
            throw new AppError('Machine and Product belong to different factories', 400);
        }

        // 6. Get Ideal Cycle Time
        // NOTE: machine_products is now keyed on (machine_id, product_template_id) since migration 022
        const { data: machineProduct, error: mpError } = await supabase
            .from('machine_products')
            .select('ideal_cycle_time_seconds')
            .eq('machine_id', data.machine_id)
            .eq('product_template_id', product.template_id)
            .single();

        if (mpError || !machineProduct) {
            throw new AppError('Machine is not configured for this product template. Please link them in Master Data first.', 400);
        }

        // ================== CALCULATION PHASE ==================

        const ideal_cycle_time = machineProduct.ideal_cycle_time_seconds;
        let actual_quantity: number;

        // Handle weight-based vs unit-count products
        if (product.counting_method === 'weight_based') {
            // Cap production: estimate quantity from weight
            if (!data.total_weight_kg) {
                throw new AppError('total_weight_kg required for weight-based products', 400);
            }
            actual_quantity = Math.floor((data.total_weight_kg * 1000) / product.weight_grams);
        } else {
            // Normal products: use total_produced - damaged_count
            if (data.total_produced === undefined) {
                throw new AppError('total_produced required for unit-count products', 400);
            }
            const damaged = data.damaged_count || 0;
            actual_quantity = data.total_produced - damaged;
        }

        if (actual_quantity < 0) {
            throw new AppError('Actual quantity cannot be negative', 400);
        }

        // === CYCLE TIME LOSS CALCULATION ===
        const actual_cycle_time = data.actual_cycle_time_seconds ?? ideal_cycle_time;
        const ideal_production_time = actual_quantity * ideal_cycle_time;
        const actual_production_time = actual_quantity * actual_cycle_time;
        const cycle_time_loss_seconds = actual_production_time - ideal_production_time;
        const units_lost_to_cycle = Math.floor(cycle_time_loss_seconds / ideal_cycle_time);

        // === DOWNTIME CALCULATION ===
        const shift_duration_seconds = shiftDuration * 60; // Convert minutes to seconds
        const downtime_seconds = shift_duration_seconds - actual_production_time;
        const downtime_minutes = Math.max(0, Math.floor(downtime_seconds / 60));

        // Validate downtime reason if > 30 mins
        if (downtime_minutes > 30 && !data.downtime_reason) {
            throw new AppError(`${downtime_minutes} minutes unaccounted. Please provide downtime reason.`, 400);
        }

        // === WEIGHT WASTAGE ===
        const ideal_total_weight = actual_quantity * product.weight_grams;
        const actual_total_weight = actual_quantity * (data.actual_weight_grams ?? product.weight_grams);
        const weight_wastage_grams = Math.max(0, actual_total_weight - ideal_total_weight);
        const weight_wastage_kg = weight_wastage_grams / 1000;

        // === CYCLE TIME VARIANCE ALERT (5% threshold) ===
        const variance_threshold = 1.05;
        const flagged_for_review = (data.actual_cycle_time_seconds ?? ideal_cycle_time) > (ideal_cycle_time * variance_threshold);

        // === EFFICIENCY (for backward compatibility) ===
        const theoretical_quantity = Math.floor(shift_duration_seconds / ideal_cycle_time);
        const efficiency_percentage = Number(((actual_quantity / theoretical_quantity) * 100).toFixed(2));

        // === RAW MATERIAL CHECK ===
        const requiredMaterialKg = (product.weight_grams * actual_quantity) / 1000;
        const rawMaterialCheck = await this.checkRawMaterialAvailability(requiredMaterialKg, product.raw_material_id);
        if (!rawMaterialCheck.sufficient) {
            throw new AppError(`Insufficient raw material. Need ${requiredMaterialKg.toFixed(2)}kg, have ${rawMaterialCheck.available.toFixed(2)}kg`, 400);
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
        logger.info('Inserting production log:', {
            machine_id: data.machine_id,
            product_id: data.product_id,
            actual_quantity,
            total_weight_kg: data.total_weight_kg
        });

        const { data: log, error } = await supabase
            .from('production_logs')
            .insert({
                date: productionDate,
                machine_id: data.machine_id,
                product_id: data.product_id,
                user_id: data.user_id,
                factory_id: factoryId,

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
                actual_cycle_time_seconds: data.actual_cycle_time_seconds ?? ideal_cycle_time,
                units_lost_to_cycle,
                flagged_for_review,

                // Weight analysis
                actual_weight_grams: data.actual_weight_grams ?? product.weight_grams,
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

        if (error) {
            logger.error('Production log insertion failed:', error);
            throw new AppError(`Production log insertion failed: ${error.message}`, 500);
        }

        // ================== INVENTORY IMPACT ==================
        if (actual_quantity > 0) {
            await this.updateInventory(data.product_id, 'semi_finished', actual_quantity, factoryId);
            await inventoryService.logTransaction('production_output', data.product_id, actual_quantity, 'loose', null, 'semi_finished', factoryId, log.id);

            await this.deductRawMaterial(product.weight_grams, actual_quantity, product.raw_material_id, factoryId);
            await inventoryService.logTransaction('raw_material_consumption', product.raw_material_id, requiredMaterialKg, 'kg', 'raw_material', null, factoryId, log.id, undefined, true);

            // ================== CAP CONSUMPTION ==================
            const capTemplateId = (product as any).product_templates?.cap_template_id;
            if (capTemplateId) {
                await this.handleCapConsumption(capTemplateId, product.color, actual_quantity, factoryId, log.id, data.user_id);
            }
        }

        // ================== SMART QUEUE ALLOCATION ==================
        // Deprecated: Automated FIFO allocation is disabled.
        // Product Managers will manually fulfill from the mobile app.
        // await stockAllocationService.allocateStock(data.product_id, 'semi_finished', actual_quantity, factoryId);

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
     * Get the end time of the last session for a machine on a given date and shift
     */
    public async getLastSessionEndTime(machineId: string, date: string, shiftNumber: number): Promise<string | null> {
        const { data, error } = await supabase
            .from('production_logs')
            .select('end_time')
            .eq('machine_id', machineId)
            .eq('date', date)
            .eq('shift_number', shiftNumber)
            .order('end_time', { ascending: false })
            .limit(1);

        if (error || !data || data.length === 0) return null;
        return data[0].end_time;
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
                    throw new AppError(`Session overlaps with existing entry (${session.start_time} - ${session.end_time})`, 400);
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

    private async checkRawMaterialAvailability(requiredKg: number, rawMaterialId?: string): Promise<{ sufficient: boolean; available: number }> {
        if (!rawMaterialId) {
            throw new AppError('Product does not have a raw material assigned. Please update the product configuration.', 400);
        }

        const { data: rawMaterial, error } = await supabase
            .from('raw_materials')
            .select('stock_weight_kg, name')
            .eq('id', rawMaterialId)
            .single();

        if (error || !rawMaterial) {
            throw new AppError('Raw material not found for this product', 404);
        }

        const available = rawMaterial.stock_weight_kg || 0;
        return {
            sufficient: available >= requiredKg,
            available
        };
    }

    private async updateInventory(productId: string, state: string, quantity: number, factoryId: string) {
        const { error } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factoryId,
            p_state: state,
            p_quantity_change: quantity,
            p_cap_id: null,
            p_unit_type: ''
        });

        if (error) {
            logger.error('Inventory adjust_stock RPC error:', error);
            throw new AppError(`Inventory update error: ${error.message}`, 500);
        }
    }

    private async handleCapConsumption(capTemplateId: string, color: string, quantity: number, factoryId: string, referenceId: string, userId: string) {
        // Find matching cap variant (matching color and template)
        const { data: cap, error } = await supabase
            .from('caps')
            .select('id, name')
            .eq('template_id', capTemplateId)
            .eq('color', color)
            .eq('factory_id', factoryId)
            .single();

        if (error || !cap) {
            logger.warn('No matching cap variant found for deduction', { capTemplateId, color, factoryId });
            return;
        }

        // Deduct cap stock
        await this.updateCapStock(cap.id, -quantity, factoryId);

        // Log transaction
        await inventoryService.logTransaction(
            'cap_consumption',
            cap.id,
            quantity,
            'loose',
            'cap',
            null,
            factoryId,
            referenceId,
            userId,
            true // isDeduction
        );
    }

    private async updateCapStock(capId: string, quantity: number, factoryId: string) {
        const { error } = await supabase.rpc('adjust_cap_stock', {
            p_cap_id: capId,
            p_factory_id: factoryId,
            p_quantity_change: quantity
        });

        if (error) {
            logger.error('Cap stock adjustment RPC error:', error);
            throw new AppError(`Cap inventory update error: ${error.message}`, 500);
        }
    }

    private async deductRawMaterial(weightGrams: number, quantity: number, rawMaterialId?: string, factoryId?: string) {
        if (!rawMaterialId) {
            logger.warn('Product missing raw material assignment, skipping deduction', { weightGrams, quantity });
            return;
        }

        const totalWeightKg = (weightGrams * quantity) / 1000;

        const { error } = await supabase.rpc('adjust_raw_material_stock', {
            p_material_id: rawMaterialId,
            p_weight_change: -totalWeightKg
        });

        if (error) {
            logger.error('Raw material adjustment RPC error:', error);
            throw new AppError(`Raw material deduction error: ${error.message}`, 500);
        }
    }

    async getProductionLogs(filters?: { machine_id?: string; product_id?: string; start_date?: string; end_date?: string; factory_id?: string; page?: number; size?: number }) {
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

        if (error) {
            logger.error('Get daily production error:', error);
            throw new AppError(error.message, 500);
        }
        return data;
    }

    async getProductionRequests(factoryId?: string) {
        let query = supabase
            .from('production_requests')
            .select(`
                *,
                products (name, size, color, factory_id),
                sales_order:sales_orders!left(order_number:id)
            `)
            .order('created_at', { ascending: false });

        if (factoryId) {
            query = query.eq('factory_id', factoryId);
        }

        // We need to filter stock_balances to match the state corresponding to the unit_type
        // However, Supabase joins are tricky with conditional filters. 
        // A better approach is to fetch and then map, or use a RPC/View.
        // For now, let's fetch all relevant stock and match in JS.

        const { data: rawData, error } = await query;
        if (error) {
            logger.error('Get production requests error:', error);
            throw new AppError(error.message, 500);
        }

        // Fetch current stock for all products in these requests to confirm availability
        const productIds = [...new Set(rawData.map(r => r.product_id))];
        const { data: stockData } = await supabase
            .from('stock_balances')
            .select('product_id, quantity, state, factory_id, unit_type')
            .in('product_id', productIds);

        const stateMapping: Record<string, string> = {
            'loose': 'semi_finished',
            'packet': 'packed',
            'bundle': 'finished'
        };

        return rawData.map(req => {
            const requiredState = stateMapping[req.unit_type];
            const productStock = stockData?.filter(s => s.product_id === req.product_id) || [];
            
            // Current satisfying stock
            const matchingStock = productStock.filter(s =>
                s.state === requiredState &&
                s.factory_id === req.factory_id &&
                (s.unit_type === (req.unit_type === 'loose' ? '' : req.unit_type))
            );
            
            const availableStock = matchingStock.reduce((sum, s) => sum + Number(s.quantity), 0);

            // Detailed Summary for UI context
            const stockSummary = {
                loose: productStock.filter(s => s.state === 'semi_finished').reduce((sum, s) => sum + Number(s.quantity), 0),
                packed: productStock.filter(s => s.state === 'packed').reduce((sum, s) => sum + Number(s.quantity), 0),
                finished: productStock.filter(s => s.state === 'finished').reduce((sum, s) => sum + Number(s.quantity), 0),
                factory_specific: {
                    loose: productStock.filter(s => s.state === 'semi_finished' && s.factory_id === req.factory_id).reduce((sum, s) => sum + Number(s.quantity), 0),
                    packed: productStock.filter(s => s.state === 'packed' && s.factory_id === req.factory_id).reduce((sum, s) => sum + Number(s.quantity), 0),
                    finished: productStock.filter(s => s.state === 'finished' && s.factory_id === req.factory_id).reduce((sum, s) => sum + Number(s.quantity), 0),
                }
            };

            return {
                ...req,
                available_stock: availableStock,
                is_satisfiable: availableStock >= req.quantity,
                stock_summary: stockSummary
            };
        });
    }

    async updateProductionRequestStatus(requestId: string, status: string, userId: string) {
        if (status === 'completed') {
            // Use manual fulfillment logic
            return await stockAllocationService.fulfillRequestManually(requestId, userId);
        }

        const { data, error } = await supabase
            .from('production_requests')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', requestId)
            .select(`
                products (name, size, color, factory_id)
            `)
            .single();

        if (error) {
            logger.error('Update production request status error:', error);
            throw new AppError(error.message, 500);
        }

        // Log other status changes in audit
        await auditService.logAction(
            userId,
            'update_request_status',
            'production_requests',
            requestId,
            { status }
        );

        return data;
    }

    // ================== CAP PRODUCTION ==================

    async submitCapProduction(data: SubmitCapProductionDTO) {
        const factoryId = data.factory_id || MAIN_FACTORY_ID;
        // 1. Get Cap Details
        const { data: cap, error: capError } = await supabase
            .from('caps')
            .select('ideal_weight_grams, name, raw_material_id')
            .eq('id', data.cap_id)
            .single();

        if (capError || !cap) {
            logger.error('Cap not found:', capError);
            throw new AppError(`Cap not found: ${capError?.message || 'Unknown error'}`, 404);
        }

        // 2. Calculate Quantity & Deduction Weight
        let initial_quantity: number | undefined = data.total_produced;
        let initial_weight_kg: number | undefined = data.total_weight_produced_kg;

        if (initial_quantity === undefined && initial_weight_kg !== undefined) {
            // Mode 1: Weight-based (Current)
            initial_quantity = Math.floor((initial_weight_kg * 1000) / cap.ideal_weight_grams);
        } else if (initial_quantity !== undefined && initial_weight_kg === undefined) {
            // Mode 2: Unit-based (Option B)
            initial_weight_kg = Number(((initial_quantity * cap.ideal_weight_grams) / 1000).toFixed(4));
        } else if (initial_quantity === undefined && initial_weight_kg === undefined) {
            throw new AppError('Either total_produced or total_weight_produced_kg must be provided', 400);
        }

        // Now they MUST be defined
        const final_quantity: number = initial_quantity!;
        const final_weight_kg: number = initial_weight_kg!;

        if (final_quantity < 0) {
            throw new AppError('Produced quantity cannot be negative', 400);
        }

        // 3. Raw Material Check & Deduction
        if (cap.raw_material_id) {
            // We still fetch to check sufficiency, but we use RPC for atomic deduction
            const { data: rawMaterial, error: rmError } = await supabase
                .from('raw_materials')
                .select('id, stock_weight_kg')
                .eq('id', cap.raw_material_id)
                .eq('factory_id', factoryId)
                .single();

            if (rmError || !rawMaterial) {
                logger.error('Assigned raw material not found:', rmError);
                throw new AppError(`Assigned raw material not found in this factory`, 404);
            }

            if (rawMaterial.stock_weight_kg < final_weight_kg) {
                throw new AppError(`Insufficient raw material. Need ${final_weight_kg.toFixed(2)}kg, have ${rawMaterial.stock_weight_kg.toFixed(2)}kg`, 400);
            }

            // Atomic Deduct using RPC
            const { error: rpcError } = await supabase.rpc('adjust_raw_material_stock', {
                p_material_id: cap.raw_material_id,
                p_weight_change: -final_weight_kg
            });

            if (rpcError) {
                logger.error('Cap raw material RPC update error:', rpcError);
                throw new AppError(`Raw material deduction error: ${rpcError.message}`, 500);
            }
        }

        // 4. Log Production
        logger.info('Inserting cap production log:', {
            ...data,
            factory_id: factoryId,
            total_weight_produced_kg: final_weight_kg,
            calculated_quantity: final_quantity
        });

        const { data: log, error: logError } = await supabase
            .from('cap_production_logs')
            .insert([{
                ...data,
                factory_id: factoryId,
                total_weight_produced_kg: final_weight_kg,
                calculated_quantity: final_quantity,
                actual_weight_grams: data.actual_weight_grams ?? cap.ideal_weight_grams,
                actual_cycle_time_seconds: data.actual_cycle_time_seconds || 0
            }])
            .select()
            .single();

        if (logError) {
            logger.error('Cap production log insertion failed:', logError);
            throw new AppError(`Cap production log error: ${logError.message}`, 500);
        }

        // 5. Update Stock Balance
        if (final_quantity > 0) {
            await this.updateCapStock(data.cap_id, final_quantity, factoryId);
        }

        // 6. Log Raw Material Consumption Transaction
        if (cap.raw_material_id) {
            await inventoryService.logTransaction(
                'raw_material_consumption',
                cap.raw_material_id,
                final_weight_kg,
                'kg',
                'raw_material',
                null,
                factoryId,
                log.id, // Linked to cap_production_log? 
                // Wait, logTransaction might expect log.id to be a production_log uuid.
                // cap_production_logs is a different table.
                // logTransaction schema: (type, item_id, quantity, unit, category, state, factory_id, related_entity_id?, is_negative?)
                // The related_entity_id is generic uuid.
                undefined,
                true
            );
        }

        // 7. Audit
        await auditService.logAction(
            data.user_id,
            'submit_cap_production',
            'cap_production_logs',
            log.id,
            { calculated_quantity: final_quantity, weight_kg: final_weight_kg }
        );

        return log;
    }

    async getCapProductionLogs(filters?: { factory_id?: string; cap_id?: string; start_date?: string; end_date?: string; page?: number; size?: number }) {
        const { from, to } = getPagination(filters?.page || 1, filters?.size || 20);

        let query = supabase
            .from('cap_production_logs')
            .select(`
                *,
                caps(name)
            `, { count: 'exact' })
            .order('date', { ascending: false })
            .range(from, to);

        if (filters?.factory_id) query = query.eq('factory_id', filters.factory_id);
        if (filters?.cap_id) query = query.eq('cap_id', filters.cap_id);
        if (filters?.start_date) query = query.gte('date', filters.start_date);
        if (filters?.end_date) query = query.lte('date', filters.end_date);

        const { data, error, count } = await query;
        if (error) {
            logger.error('Get cap production logs error:', error);
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

export const productionService = new ProductionService();
