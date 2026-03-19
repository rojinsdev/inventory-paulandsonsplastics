import { supabase } from '../../config/supabase';
import { SettingsService } from '../settings/settings.service';
import { stockAllocationService } from './stock-allocation.service';
import { cashFlowService } from '../cash-flow/cash-flow.service';
import logger from '../../utils/logger';
import { getPagination } from '../../utils/supabase';

// Helper to get product packing details (uses template-variant architecture)
async function getProductPackingDetails(productId: string) {
    const { data, error } = await supabase
        .from('products')
        .select(`
            items_per_packet,
            packets_per_bundle,
            items_per_bundle,
            packets_per_bag,
            items_per_bag,
            packets_per_box,
            items_per_box,
            factory_id,
            color,
            product_templates!inner(cap_template_id)
        `)
        .eq('id', productId)
        .single();

    if (error || !data) throw new Error('Product not found for packing details');
    return data;
}

// Helper to find a cap variant (cap) matching a cap template and a product color
async function findCapVariantByTemplate(capTemplateId: string, productColor: string, factoryId: string): Promise<string | null> {
    // Try to match by color first (exact), then fall back to the first variant
    const { data: caps, error } = await supabase
        .from('caps')
        .select('id, color')
        .eq('template_id', capTemplateId)
        .eq('factory_id', factoryId);

    if (error || !caps || caps.length === 0) return null;

    // Exact color match
    const exactMatch = caps.find(c => c.color?.toLowerCase() === productColor?.toLowerCase());
    if (exactMatch) return exactMatch.id;

    // Fallback: return first variant
    return caps[0].id;
}

const MAIN_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';

export class InventoryService {

    // 1. Pack: Semi-Finished (Loose) -> Packed (Packets)
    async packItems(productId: string, packetsCreated: number, selectedCapId?: string) {
        const productDetails = await getProductPackingDetails(productId);
        const factory = productDetails.factory_id || MAIN_FACTORY_ID;

        const itemsPerPacket = productDetails.items_per_packet || 12;

        // Resolve cap variant via template + product color (new template architecture)
        const capTemplateId = (productDetails as any).product_templates?.[0]?.cap_template_id
            ?? (productDetails as any).product_templates?.cap_template_id;
        const resolvedCapId = selectedCapId
            || (capTemplateId ? await findCapVariantByTemplate(capTemplateId, productDetails.color, factory) : null);

        // Get items per packet from product
        const requiredLooseItems = packetsCreated * itemsPerPacket;

        // Deduct Semi-Finished stock (no cap — loose items never have a cap dimension)
        const { error: deductError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factory,
            p_state: 'semi_finished',
            p_quantity_change: -requiredLooseItems,
            p_cap_id: null,
            p_unit_type: ''
        });

        if (deductError) throw new Error(`Failed to deduct semi-finished stock: ${deductError.message}`);

        // Add Packed stock (with the resolved cap)
        const { error: addError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factory,
            p_state: 'packed',
            p_quantity_change: packetsCreated,
            p_cap_id: resolvedCapId,
            p_unit_type: 'packet'
        });

        if (addError) {
            // Rollback deduction if add fails
            await supabase.rpc('adjust_stock', {
                p_product_id: productId,
                p_factory_id: factory,
                p_state: 'semi_finished',
                p_quantity_change: requiredLooseItems,
                p_cap_id: null,
                p_unit_type: ''
            });
            throw new Error(`Failed to add packed stock: ${addError.message}`);
        }

        // ================== SMART QUEUE ALLOCATION ==================
        await stockAllocationService.allocateStock(productId, 'packed', packetsCreated, factory);

        // Log Transaction
        await this.logTransaction('pack', productId, packetsCreated, 'packet', 'semi_finished', 'packed', factory);

        // Deduct Cap Inventory
        if (resolvedCapId) {
            await this.deductCapInventory(resolvedCapId, requiredLooseItems, factory, `Deduction for packing ${packetsCreated} packets of ${productId}`);
        }
    }

    // 2. Bundle: Packed (Packets) OR Semi-Finished (Loose) -> Finished (Units: Bundles/Bags/Boxes)
    async bundlePackets(productId: string, unitsCreated: number, unitType: 'bundle' | 'bag' | 'box', source: 'packed' | 'semi_finished' = 'packed', selectedCapId?: string) {
        const productDetails = await getProductPackingDetails(productId);
        const factory = productDetails.factory_id || MAIN_FACTORY_ID;

        const packetsPerBundle = productDetails.packets_per_bundle || 50;
        const itemsPerBundle = productDetails.items_per_bundle || 600;

        // Resolve cap variant via template + product color
        const capTemplateId = (productDetails as any).product_templates?.[0]?.cap_template_id
            ?? (productDetails as any).product_templates?.cap_template_id;
        const resolvedCapId = selectedCapId
            || (capTemplateId ? await findCapVariantByTemplate(capTemplateId, productDetails.color, factory) : null);

        let requiredQuantity: number;
        const sourceState = source;

        if (source === 'packed') {
            const packetsPerUnit = unitType === 'box'
                ? productDetails.packets_per_box
                : (unitType === 'bag' ? productDetails.packets_per_bag : productDetails.packets_per_bundle);

            requiredQuantity = unitsCreated * (packetsPerUnit || 50);
        } else {
            // Loose -> Unit
            const itemsPerUnit = unitType === 'box'
                ? productDetails.items_per_box
                : (unitType === 'bag' ? productDetails.items_per_bag : productDetails.items_per_bundle);

            requiredQuantity = unitsCreated * (itemsPerUnit || 600);
        }

        // Deduct Source atomically
        const { error: deductError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factory,
            p_state: sourceState,
            p_quantity_change: -requiredQuantity,
            p_cap_id: source === 'packed' ? resolvedCapId : null,
            p_unit_type: source === 'packed' ? 'packet' : ''
        });

        if (deductError) throw new Error(`Failed to deduct ${sourceState} stock: ${deductError.message}`);

        // Add Finished (Bundles/Bags/Boxes) atomically
        const { error: addError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factory,
            p_state: 'finished',
            p_quantity_change: unitsCreated,
            p_cap_id: resolvedCapId,
            p_unit_type: unitType
        });

        if (addError) {
            // Rollback deduction if add fails
            await supabase.rpc('adjust_stock', {
                p_product_id: productId,
                p_factory_id: factory,
                p_state: sourceState,
                p_quantity_change: requiredQuantity,
                p_cap_id: source === 'packed' ? resolvedCapId : null,
                p_unit_type: source === 'packed' ? 'packet' : ''
            });
            throw new Error(`Failed to add finished stock: ${addError.message}`);
        }

        // ================== SMART QUEUE ALLOCATION ==================
        await stockAllocationService.allocateStock(productId, 'finished', unitsCreated, factory);

        // Log Transaction
        await this.logTransaction('bundle', productId, unitsCreated, unitType, sourceState, 'finished', factory);

        // Deduct Cap ONLY if sourcing from loose (packed items already had caps deducted at packing time)
        if (source === 'semi_finished') {
            if (resolvedCapId) {
                await this.deductCapInventory(resolvedCapId, requiredQuantity, factory, `Deduction for direct bundling ${unitsCreated} ${unitType}s of ${productId}`);
            }
        }
    }
    // 3. Unpack: Reverse Logistics (Bundle/Packet -> Packets/Loose)
    async unpack(productId: string, quantityToUnpack: number, fromState: 'finished' | 'packed', toState: 'packed' | 'semi_finished', unitType: string = 'bundle', capId?: string) {
        const productDetails = await getProductPackingDetails(productId);
        const factory = productDetails.factory_id || MAIN_FACTORY_ID;

        // Validation: Cannot unpack to the same state
        if (fromState === toState) {
            throw new Error('Source and target states must be different');
        }

        // Specific valid transitions
        if (fromState === 'finished' && toState === 'packed') {
            // Finished Unit -> Packets
        } else if (fromState === 'finished' && toState === 'semi_finished') {
            // Finished Unit -> Loose
        } else if (fromState === 'packed' && toState === 'semi_finished') {
            // Packet -> Loose
        } else {
            throw new Error(`Invalid unpack transition: ${fromState} to ${toState}`);
        }

        let packetsPerUnit = 0;
        let itemsPerUnit = 0;

        if (unitType === 'bundle') {
            packetsPerUnit = productDetails.packets_per_bundle || 50;
            itemsPerUnit = productDetails.items_per_bundle || 600;
        } else if (unitType === 'bag') {
            packetsPerUnit = (productDetails as any).packets_per_bag || 0;
            itemsPerUnit = (productDetails as any).items_per_bag || 0;
        } else if (unitType === 'box') {
            packetsPerUnit = (productDetails as any).packets_per_box || 0;
            itemsPerUnit = (productDetails as any).items_per_box || 0;
        }

        const itemsPerPacket = productDetails.items_per_packet || 12;

        let multiplier = 0;
        if (fromState === 'finished') {
            if (toState === 'packed') {
                multiplier = packetsPerUnit;
            } else {
                multiplier = itemsPerUnit;
            }
        } else if (fromState === 'packed') {
            multiplier = itemsPerPacket;
        }

        if (multiplier === 0) {
            throw new Error(`Invalid configuration for unpacking ${unitType} of ${productId}. Multiplier is 0.`);
        }

        const yieldQuantity = quantityToUnpack * multiplier;


        // 2. Deduct Source atomically
        const { error: deductError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factory,
            p_state: fromState,
            p_quantity_change: -quantityToUnpack,
            p_cap_id: capId || null,
            p_unit_type: fromState === 'finished' ? unitType : 'packet'
        });

        if (deductError) throw new Error(`Failed to deduct ${fromState} stock: ${deductError.message}`);

        // 3. Add to Target atomically
        const targetCapId = toState === 'semi_finished' ? null : (capId || null);

        const { error: addError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factory,
            p_state: toState,
            p_quantity_change: yieldQuantity,
            p_cap_id: targetCapId,
            p_unit_type: toState === 'packed' ? 'packet' : ''
        });

        if (addError) {
            // Rollback deduction if add fails
            await supabase.rpc('adjust_stock', {
                p_product_id: productId,
                p_factory_id: factory,
                p_state: fromState,
                p_quantity_change: quantityToUnpack,
                p_cap_id: capId || null,
                p_unit_type: fromState === 'finished' ? unitType : 'packet'
            });
            throw new Error(`Failed to add ${toState} stock: ${addError.message}`);
        }

        // Log Transaction
        await this.logTransaction('unpack', productId, quantityToUnpack, fromState === 'finished' ? unitType : 'packet', fromState, toState, factory, capId, `Unpacked ${quantityToUnpack} ${fromState === 'finished' ? unitType : 'packet'} yielding ${yieldQuantity} ${toState === 'packed' ? 'packets' : 'loose items'}`);

        // 4. Return Caps ONLY if target is semi_finished (loose items — caps removed from product)
        if (toState === 'semi_finished') {
            const capTemplateId = (productDetails as any).product_templates?.[0]?.cap_template_id
                ?? (productDetails as any).product_templates?.cap_template_id;
            const returnCapId = capId || (capTemplateId ? await findCapVariantByTemplate(capTemplateId, productDetails.color, factory) : null);
            if (returnCapId) {
                await this.addCapInventory(
                    returnCapId,
                    yieldQuantity,
                    factory,
                    `Return for unpacking ${quantityToUnpack} ${fromState === 'finished' ? unitType : 'packet'} of ${productId}`
                );
            }
        }
    }

    public async logTransaction(
        type: string,
        entityId: string | null,
        qty: number,
        unitType: string,
        fromState: string | null,
        toState: string | null,
        factoryId: string,
        referenceId?: string,
        note?: string,
        isRawMaterial: boolean = false,
        cost_per_kg?: number,
        total_cost?: number
    ) {
        const { error } = await supabase.from('inventory_transactions').insert({
            product_id: isRawMaterial ? null : entityId,
            raw_material_id: isRawMaterial ? entityId : null,
            quantity: qty,
            unit_type: unitType,
            from_state: fromState,
            to_state: toState,
            transaction_type: type,
            factory_id: factoryId,
            reference_id: referenceId,
            note: note || `Transaction ${type} for ${qty} ${unitType}s`,
            cost_per_kg,
            total_cost
        });

        if (error) {
            logger.error('Failed to log inventory transaction:', { error: error.message, type, entityId, qty });
            throw new Error(`Inventory transaction logging failed: ${error.message}`);
        }
    }

    private async deductCapInventory(capId: string, quantity: number, factoryId: string, note?: string) {
        const { error } = await supabase.rpc('adjust_cap_stock', {
            p_cap_id: capId,
            p_factory_id: factoryId,
            p_quantity_change: -quantity
        });

        if (error) throw new Error(`Cap stock deduction error: ${error.message}`);
        logger.info(`Deducted ${quantity} caps (ID: ${capId}) for ${note}`);
    }

    private async addCapInventory(capId: string, quantity: number, factoryId: string, note?: string) {
        const { error } = await supabase.rpc('adjust_cap_stock', {
            p_cap_id: capId,
            p_factory_id: factoryId,
            p_quantity_change: quantity
        });

        if (error) throw new Error(`Cap stock addition error: ${error.message}`);

        // 3. Log to general inventory transactions for visibility
        await this.logTransaction(
            'unpack_return',
            null,
            quantity,
            'packet', // Use packet as proxy or similar if 'cap' not allowed, but let's check
            null,
            'semi_finished',
            factoryId,
            capId, // Use reference_id for capId
            note || `Returned ${quantity} caps for unpacking`
        );

        logger.info(`Returned ${quantity} caps (ID: ${capId}) for ${note}`);
    }

    async getStock(productId: string) {
        const { data } = await supabase
            .from('stock_balances')
            .select('*')
            .eq('product_id', productId);
        return data;
    }

    async getAllStock(filters?: { factoryId?: string; page?: number; size?: number }) {
        const { from, to } = getPagination(filters?.page, filters?.size);

        let query = supabase
            .from('stock_balances')
            .select(`
                *,
                products(name, size, color, selling_price, factory_id)
            `, { count: 'exact' })
            .order('product_id');

        // Filter by factory if provided
        if (filters?.factoryId) {
            query = query.eq('products.factory_id', filters.factoryId);
        }

        const { data, error, count } = await query.range(from, to);

        if (error) throw new Error(error.message);
        return {
            stock: data,
            pagination: {
                total: count,
                page: filters?.page || 1,
                size: filters?.size || 10
            }
        };
    }

    async getAvailableStock(factoryId?: string) {
        let query = supabase
            .from('stock_balances')
            .select(`
                *,
                products(name, size, color, selling_price, factory_id)
            `)
            .eq('state', 'finished')
            .order('product_id');

        // Filter by factory if provided
        if (factoryId) {
            query = query.eq('products.factory_id', factoryId);
        }

        const { data, error } = await query;

        if (error) throw new Error(error.message);
        return data;
    }

    async getStockOverview(factoryId?: string) {
        // 1. Get products (including template info)
        let productQuery = supabase
            .from('products')
            .select('id, name, size, color, factory_id, items_per_packet, packets_per_bundle, items_per_bundle, template_id, product_templates(name, size)');

        if (factoryId) {
            productQuery = productQuery.or(`factory_id.eq.${factoryId},factory_id.is.null`);
        }
        const { data: products, error: pError } = await productQuery;
        if (pError) throw new Error(pError.message);

        // 2. Get caps for display
        const { data: caps } = await supabase.from('caps').select('id, color');

        // 3. Get all balances for this factory
        let balanceQuery = supabase.from('stock_balances').select('*, caps(color)');
        if (factoryId) {
            balanceQuery = balanceQuery.eq('factory_id', factoryId);
        }
        const { data: balances, error: bError } = await balanceQuery;
        if (bError) throw new Error(bError.message);

        // 4. Aggregate
        const overview = products.map(product => {
            const productBalances = balances.filter(b => b.product_id === product.id);

            // For packed/finished, they have caps, so we might have multiple combinations
            // Group by cap_id for packed and finished
            const combinations: any[] = [];

            // Loose (Semi-finished) - usually no cap
            const semiFinished = productBalances.filter(b => b.state === 'semi_finished');
            const semiFinishedQty = semiFinished.reduce((sum, b) => sum + b.quantity, 0);

            // Packed and Finished - with caps
            const cappedStates = ['packed', 'finished'];
            const comboMap = new Map<string, any>();

            productBalances.filter(b => cappedStates.includes(b.state)).forEach(b => {
                const key = `${b.cap_id || 'no_cap'}_${b.unit_type || ''}`;
                if (!comboMap.has(key)) {
                    comboMap.set(key, {
                        cap_id: b.cap_id,
                        cap_color: (b as any).caps?.color || 'N/A',
                        unit_type: b.unit_type,
                        packed_qty: 0,
                        bundled_qty: 0
                    });
                }
                const combo = comboMap.get(key);
                if (b.state === 'packed') combo.packed_qty += b.quantity;
                if (b.state === 'finished') combo.bundled_qty += b.quantity;
            });

            return {
                product_id: product.id,
                template_id: product.template_id,
                template_name: (product as any).product_templates?.name || product.name,
                product_name: `${product.name} (${product.size})`,
                color: product.color,
                semi_finished_qty: semiFinishedQty,
                items_per_packet: (product as any).items_per_packet,
                packets_per_bundle: (product as any).packets_per_bundle,
                items_per_bundle: (product as any).items_per_bundle,
                packets_per_bag: (product as any).packets_per_bag,
                items_per_bag: (product as any).items_per_bag,
                packets_per_box: (product as any).packets_per_box,
                items_per_box: (product as any).items_per_box,
                combinations: Array.from(comboMap.values()),
                factory_id: product.factory_id
            };
        });

        return overview;
    }

    // Raw Materials Methods
    async getRawMaterials(filters?: { factoryId?: string; page?: number; size?: number }) {
        const { from, to } = getPagination(filters?.page, filters?.size);

        let query = supabase
            .from('raw_materials')
            .select('*', { count: 'exact' })
            .order('name');

        // Filter by factory if provided
        if (filters?.factoryId) {
            query = query.or(`factory_id.eq.${filters.factoryId},factory_id.is.null`);
        }

        const { data, error, count } = await query.range(from, to);

        if (error) throw new Error(error.message);
        return {
            rawMaterials: data,
            pagination: {
                total: count,
                page: filters?.page || 1,
                size: filters?.size || 10
            }
        };
    }

    async adjustRawMaterial(id: string, data: { quantity: number; unit: 'bags' | 'kg' | 'tons'; rate_per_kg: number; reason: string; payment_mode?: 'Cash' | 'Credit'; date?: string }) {
        // 1. Fetch material and its config
        const { data: material, error: fetchError } = await supabase
            .from('raw_materials')
            .select('stock_weight_kg, bag_weight_kg, factory_id')
            .eq('id', id)
            .single();

        if (fetchError || !material) throw new Error('Raw material not found');

        const { quantity, unit, rate_per_kg, reason } = data;
        const bagWeight = material.bag_weight_kg || 25;

        // 2. Calculate Total Weight in kg
        let adjustmentKg = 0;
        if (unit === 'bags') {
            adjustmentKg = quantity * bagWeight;
        } else if (unit === 'tons') {
            adjustmentKg = quantity * 1000;
        } else {
            adjustmentKg = quantity;
        }

        const newQuantity = material.stock_weight_kg + adjustmentKg;
        if (newQuantity < 0) throw new Error('Cannot reduce below zero');

        const totalCost = adjustmentKg * rate_per_kg;

        // 3. Update stock and last cost
        const { data: updated, error } = await supabase
            .from('raw_materials')
            .update({
                stock_weight_kg: newQuantity,
                last_cost_per_kg: rate_per_kg,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        // 4. Log detailed transaction
        await this.logTransaction(
            adjustmentKg > 0 ? 'purchase' : 'adjustment',
            id,
            adjustmentKg,
            'kg',
            'raw_material',
            'raw_material',
            material.factory_id,
            undefined,
            reason || `Adjustment: ${quantity} ${unit} at ${rate_per_kg}/kg`,
            true,
            rate_per_kg,
            totalCost
        );

        // 5. Log to Cash Flow if it's a purchase (adjustmentKg > 0)
        // Default to 'Cash' if no payment_mode is provided for backward compatibility
        const paymentMode = data.payment_mode || 'Cash';
        if (adjustmentKg > 0 && paymentMode === 'Cash') {
            const categoryId = await cashFlowService.getCategoryId('Raw Material Purchase', 'expense');
            await cashFlowService.logEntry({
                date: data.date, // Pass the explicit date if provided
                category_id: categoryId,
                factory_id: material.factory_id,
                amount: totalCost,
                payment_mode: 'Cash',
                reference_id: id, // Link to the material record
                notes: `Auto: ${quantity} ${unit} of ${updated.name} (Audit ID: ${updated.id})`,
                is_automatic: true
            });
        }

        return updated;
    }

    async createRawMaterial(data: { name: string; stock_weight_kg: number; factory_id?: string; bag_weight_kg?: number; last_cost_per_kg?: number; type?: string; min_threshold_kg?: number }) {
        const { data: material, error } = await supabase
            .from('raw_materials')
            .insert({
                name: data.name,
                stock_weight_kg: data.stock_weight_kg,
                min_threshold_kg: data.min_threshold_kg || 100,
                type: data.type || 'Granule',
                factory_id: data.factory_id || MAIN_FACTORY_ID,
                bag_weight_kg: data.bag_weight_kg || 25,
                last_cost_per_kg: data.last_cost_per_kg
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') throw new Error('Material with this name already exists');
            throw new Error(error.message);
        }

        return material;
    }

    async updateRawMaterial(id: string, data: { name?: string; bag_weight_kg?: number; type?: string; min_threshold_kg?: number }) {
        const { data: material, error } = await supabase
            .from('raw_materials')
            .update({
                ...data,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return material;
    }

}

export const inventoryService = new InventoryService();

