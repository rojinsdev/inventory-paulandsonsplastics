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
            product_templates!inner(cap_template_id, inner_template_id)
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

// Helper to find an inner variant matching an inner template
async function findInnerVariantByTemplate(innerTemplateId: string, factoryId: string): Promise<string | null> {
    const { data: inners, error } = await supabase
        .from('inners')
        .select('id')
        .eq('template_id', innerTemplateId)
        .eq('factory_id', factoryId);

    if (error || !inners || inners.length === 0) return null;
    return inners[0].id;
}

// Sanitizer to prevent "null" string from hitting UUID columns
function sanitizeUUID(id: any): string | null {
    if (!id || id === 'null' || id === 'undefined') return null;
    return id;
}

const MAIN_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';

export interface BulkInitItem {
    type: 'raw_material' | 'product' | 'cap' | 'inner';
    id: string;
    quantity: number;
    unit_type?: string;
    state?: string;
}

export interface BulkInitDTO {
    factoryId: string;
    userId: string;
    items: BulkInitItem[];
}

export class InventoryService {
    private async ensureSufficientStock(productId: string | null, state: string, quantity: number, factoryId: string, capId: string | null = null, innerId: string | null = null, unitType: string = '') {
        const query = supabase
            .from('stock_balances')
            .select('quantity')
            .eq('state', state)
            .eq('factory_id', factoryId);

        if (productId) query.eq('product_id', productId);
        else query.is('product_id', null);

        // Conditional equality checks to handle NULL safely
        if (capId) query.eq('cap_id', sanitizeUUID(capId));
        else query.is('cap_id', null);

        if (innerId) query.eq('inner_id', sanitizeUUID(innerId));
        else query.is('inner_id', null);

        // Unit type check with legacy fallback
        if (unitType) {
            query.eq('unit_type', unitType);
        } else if (state === 'semi_finished') {
            query.eq('unit_type', 'loose');
        } else {
            query.eq('unit_type', '');
        }

        const { data, error } = await query.maybeSingle();

        if (error) {
            throw new Error(`Error checking stock availability: ${error.message}`);
        }

        let currentQty = data?.quantity || 0;

        // Legacy Fallback: If we were looking for 'packet' and found 0, try looking for '' (Legacy Packed)
        if (currentQty < quantity && unitType === 'packet' && !capId && !innerId) {
            const { data: legacyData } = await supabase
                .from('stock_balances')
                .select('quantity')
                .eq('product_id', productId)
                .eq('state', state)
                .eq('factory_id', factoryId)
                .is('cap_id', null)
                .is('inner_id', null)
                .eq('unit_type', '')
                .maybeSingle();
            
            if (legacyData?.quantity) {
                currentQty = legacyData.quantity;
            }
        }

        if (currentQty < quantity) {
            const displayState = state.replace('_', ' ');
            const displayUnit = unitType ? ` (${unitType})` : '';
            throw new Error(`Insufficient ${displayState}${displayUnit} stock. Required: ${quantity}, Available: ${currentQty}`);
        }
    }

    /**
     * Move stock between factories atomically
     */
    async transferStock(data: {
        productId: string | null;
        fromFactoryId: string;
        toFactoryId: string;
        quantity: number;
        state: string;
        unitType: string;
        userId: string;
        capId?: string | null;
        innerId?: string | null;
    }) {
        logger.info('Transferring stock atomically:', data);

        const { data: result, error } = await supabase.rpc('transfer_stock_atomic', {
            p_product_id: data.productId,
            p_from_factory_id: data.fromFactoryId,
            p_to_factory_id: data.toFactoryId,
            p_quantity: data.quantity,
            p_state: data.state,
            p_unit_type: data.unitType,
            p_user_id: data.userId,
            p_cap_id: data.capId,
            p_inner_id: data.innerId
        });

        if (error) {
            logger.error('transfer_stock_atomic failed:', error);
            throw new Error(`Transfer failed: ${error.message}`);
        }

        return result;
    }

    /**
     * Helper to discover the correct stock variant if not explicitly provided.
     * Useful for bundling/unpacking where the user might not select a specific cap/inner.
     * Implements a multi-stage resolution policy:
     * 1. Exact Unit Type Match
     * 2. Legacy Fallback
     * 3. Dominant Stock Selection (>95% of total product stock in that state)
     */
    private async discoverStockVariant(productId: string, state: string, factoryId: string, unitType: string) {
        // Query for all variants of this product in this state with > 0 quantity
        const { data: allStock, error } = await supabase
            .from('stock_balances')
            .select(`
                cap_id, 
                inner_id, 
                quantity, 
                unit_type,
                caps:cap_id(color),
                inners:inner_id(factory_id)
            `)
            .eq('product_id', productId)
            .eq('state', state)
            .eq('factory_id', factoryId)
            .gt('quantity', 0);

        if (error) throw new Error(`Error discovering stock variant: ${error.message}`);
        if (!allStock || allStock.length === 0) return { capId: null, innerId: null, found: false };

        // --- STAGE 1: Exact Unit Type Match ---
        const exactMatches = allStock.filter(v => v.unit_type === unitType);
        if (exactMatches.length === 1) {
            return { capId: exactMatches[0].cap_id, innerId: exactMatches[0].inner_id, found: true };
        }

        // --- STAGE 2: Legacy Fallback (Include "" and NULL) ---
        const legacyMatches = allStock.filter(v => 
            v.unit_type === unitType || 
            (unitType === 'packet' && (v.unit_type === '' || !v.unit_type))
        );

        if (legacyMatches.length === 1) {
             return { capId: legacyMatches[0].cap_id, innerId: legacyMatches[0].inner_id, found: true };
        }

        // --- STAGE 3: Dominant Selection (>95% of total stock) ---
        if (allStock.length > 1) {
            const totalStock = allStock.reduce((sum, v) => sum + Number(v.quantity), 0);
            const dominant = allStock.find(v => (Number(v.quantity) / totalStock) > 0.95);
            
            if (dominant) {
                logger.info(`Dominant stock variant auto-selected for ${productId} (${state}): Using variant with ${dominant.quantity}/${totalStock} items.`);
                return { capId: dominant.cap_id, innerId: dominant.inner_id, found: true };
            }

            // --- STAGE 4: Ambiguity Error with details ---
            const variantsDetails = allStock.map(v => {
                const capColor = (v as any).caps?.color ? `${(v as any).caps.color} Cap` : 'No Cap';
                const innerInfo = v.inner_id ? 'with Inner' : 'No Inner';
                return `${v.quantity}x ${capColor} ${innerInfo}`;
            }).join(', ');

            throw new Error(`Multiple ${state.replace('_', ' ')} variants found: ${variantsDetails}. Please select a specific variant.`);
        }

        return { capId: null, innerId: null, found: false };
    }


    // 1. Pack: Semi-Finished (Loose) -> Packed (Packets)
    async packItems(productId: string, packetsCreated: number, selectedCapId?: string, selectedInnerId?: string, userId?: string) {
        const productDetails = await getProductPackingDetails(productId);
        const factory = productDetails.factory_id || MAIN_FACTORY_ID;

        const itemsPerPacket = productDetails.items_per_packet || 12;

        // Resolve cap variant via template + product color (new template architecture)
        const capTemplateId = (productDetails as any).product_templates?.[0]?.cap_template_id
            ?? (productDetails as any).product_templates?.cap_template_id;
        const resolvedCapId = selectedCapId
            || (capTemplateId ? await findCapVariantByTemplate(capTemplateId, productDetails.color, factory) : null);

        // Resolve inner variant
        const innerTemplateId = (productDetails as any).product_templates?.[0]?.inner_template_id
            ?? (productDetails as any).product_templates?.inner_template_id;
        const resolvedInnerId = selectedInnerId
            || (innerTemplateId ? await findInnerVariantByTemplate(innerTemplateId, factory) : null);

        // Get items per packet from product
        const requiredLooseItems = packetsCreated * itemsPerPacket;

        // Validation: Ensure sufficient loose stock
        await this.ensureSufficientStock(productId, 'semi_finished', requiredLooseItems, factory, null, null, 'loose');

        // Deduct Semi-Finished stock (no cap — loose items never have a cap dimension)
        const { error: deductError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factory,
            p_state: 'semi_finished',
            p_quantity_change: -requiredLooseItems,
            p_cap_id: null,
            p_unit_type: 'loose',
            p_inner_id: null
        });

        if (deductError) throw new Error(`Failed to deduct semi-finished stock: ${deductError.message}`);

        // Add Packed stock (with the resolved cap)
        const { error: addError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factory,
            p_state: 'packed',
            p_quantity_change: packetsCreated,
            p_cap_id: resolvedCapId,
            p_unit_type: 'packet',
            p_inner_id: resolvedInnerId
        });

        if (addError) {
            // Rollback deduction if add fails
            await supabase.rpc('adjust_stock', {
                p_product_id: productId,
                p_factory_id: factory,
                p_state: 'semi_finished',
                p_quantity_change: requiredLooseItems,
                p_cap_id: null,
                p_unit_type: '',
                p_inner_id: null
            });
            throw new Error(`Failed to add packed stock: ${addError.message}`);
        }

        // ================== SMART QUEUE ALLOCATION ==================
        await stockAllocationService.allocateStock(productId, 'packed', packetsCreated, factory);

        // Log Transaction
        await this.logTransaction('pack', productId, packetsCreated, 'packet', 'semi_finished', 'packed', factory, undefined, undefined, false, undefined, undefined, userId);

        // Deduct Cap Inventory
        if (resolvedCapId) {
            await this.deductCapInventory(resolvedCapId, requiredLooseItems, factory, `Deduction for packing ${packetsCreated} packets of ${productId}`);
        }

        // Deduct Inner Inventory
        if (resolvedInnerId) {
            await this.deductInnerInventory(resolvedInnerId, requiredLooseItems, factory, `Deduction for packing ${packetsCreated} packets of ${productId}`);
        }
    }

    // 2. Bundle: Packed (Packets) OR Semi-Finished (Loose) -> Finished (Units: Bundles/Bags/Boxes)
    async bundlePackets(productId: string, unitsCreated: number, unitType: 'bundle' | 'bag' | 'box', source: 'packed' | 'semi_finished' = 'packed', selectedCapId?: string, selectedInnerId?: string, userId?: string) {
        const productDetails = await getProductPackingDetails(productId);
        const factory = productDetails.factory_id || MAIN_FACTORY_ID;

        const packetsPerBundle = productDetails.packets_per_bundle || 50;
        const itemsPerBundle = productDetails.items_per_bundle || 600;

        let requiredQuantity: number;
        const sourceState = source;

        // Resolve IDs
        let finalCapId: string | undefined = selectedCapId;
        let finalInnerId: string | undefined = selectedInnerId;

        // Resolve IDs via templates
        const productTemplatesArr = (productDetails as any).product_templates;
        const capTemplateId = Array.isArray(productTemplatesArr) ? productTemplatesArr[0]?.cap_template_id : productTemplatesArr?.cap_template_id;
        const innerTemplateId = Array.isArray(productTemplatesArr) ? productTemplatesArr[0]?.inner_template_id : productTemplatesArr?.inner_template_id;

        if (!finalCapId && capTemplateId) {
            finalCapId = await findCapVariantByTemplate(capTemplateId, productDetails.color, factory) || undefined;
        }
        if (!finalInnerId && innerTemplateId) {
            finalInnerId = await findInnerVariantByTemplate(innerTemplateId, factory) || undefined;
        }

        // Smart Discovery Fallback (if still missing dimensions and source is packed)
        if (source === 'packed' && (!finalCapId || !finalInnerId)) {
            const discovery = await this.discoverStockVariant(productId, sourceState, factory, 'packet');
            if (discovery.found) {
                finalCapId = finalCapId || discovery.capId || undefined;
                finalInnerId = finalInnerId || discovery.innerId || undefined;
            }
        }

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

        // Validation: Ensure sufficient source stock
        await this.ensureSufficientStock(
            productId,
            sourceState,
            requiredQuantity,
            factory,
            source === 'packed' ? finalCapId : null,
            source === 'packed' ? finalInnerId : null,
            source === 'packed' ? 'packet' : 'loose'
        );

        // Deduct Source atomically
        const { error: deductError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factory,
            p_state: sourceState,
            p_quantity_change: -requiredQuantity,
            p_cap_id: source === 'packed' ? finalCapId : null,
            p_inner_id: source === 'packed' ? finalInnerId : null,
            p_unit_type: source === 'packed' ? 'packet' : 'loose'
        });

        if (deductError) throw new Error(`Failed to deduct ${sourceState} stock: ${deductError.message}`);

        // Add Finished (Bundles/Bags/Boxes) atomically
        const { error: addError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factory,
            p_state: 'finished',
            p_quantity_change: unitsCreated,
            p_cap_id: finalCapId,
            p_inner_id: finalInnerId,
            p_unit_type: unitType
        });

        if (addError) {
            // Rollback deduction if add fails
            await supabase.rpc('adjust_stock', {
                p_product_id: productId,
                p_factory_id: factory,
                p_state: sourceState,
                p_quantity_change: requiredQuantity,
                p_cap_id: source === 'packed' ? finalCapId : null,
                p_inner_id: source === 'packed' ? finalInnerId : null,
                p_unit_type: source === 'packed' ? 'packet' : ''
            });
            throw new Error(`Failed to add finished stock: ${addError.message}`);
        }

        // ================== SMART QUEUE ALLOCATION ==================
        await stockAllocationService.allocateStock(productId, 'finished', unitsCreated, factory);

        // Log Transaction
        await this.logTransaction('bundle', productId, unitsCreated, unitType, sourceState, 'finished', factory, undefined, undefined, false, undefined, undefined, userId, finalCapId, finalInnerId);

        // Deduct Cap ONLY if sourcing from loose (packed items already had caps deducted at packing time)
        if (source === 'semi_finished') {
            if (finalCapId) {
                await this.deductCapInventory(finalCapId, requiredQuantity, factory, `Deduction for direct bundling ${unitsCreated} ${unitType}s of ${productId}`);
            }
            if (finalInnerId) {
                await this.deductInnerInventory(finalInnerId, requiredQuantity, factory, `Deduction for direct bundling ${unitsCreated} ${unitType}s of ${productId}`);
            }
        }
    }
    // 3. Unpack: Reverse Logistics (Bundle/Packet -> Packets/Loose)
    async unpack(productId: string, quantityToUnpack: number, fromState: 'finished' | 'packed', toState: 'packed' | 'semi_finished', unitType: string = 'bundle', selectedCapId?: string, selectedInnerId?: string, userId?: string) {
        const productDetails = await getProductPackingDetails(productId);
        const factory = productDetails.factory_id || MAIN_FACTORY_ID;

        // Resolve IDs
        let finalCapId: string | undefined = selectedCapId;
        let finalInnerId: string | undefined = selectedInnerId;

        // Resolve IDs via templates
        const productTemplatesArr = (productDetails as any).product_templates;
        const capTemplateId = Array.isArray(productTemplatesArr) ? productTemplatesArr[0]?.cap_template_id : productTemplatesArr?.cap_template_id;
        const innerTemplateId = Array.isArray(productTemplatesArr) ? productTemplatesArr[0]?.inner_template_id : productTemplatesArr?.inner_template_id;

        if (!finalCapId && capTemplateId) {
            finalCapId = await findCapVariantByTemplate(capTemplateId, productDetails.color, factory) || undefined;
        }
        if (!finalInnerId && innerTemplateId) {
            finalInnerId = await findInnerVariantByTemplate(innerTemplateId, factory) || undefined;
        }

        // Smart Discovery Fallback (if still missing IDs)
        if (!finalCapId || !finalInnerId) {
            const sourceUnitType = fromState === 'finished' ? unitType : 'packet';
            const discovery = await this.discoverStockVariant(productId, fromState, factory, sourceUnitType);
            if (discovery.found) {
                finalCapId = finalCapId || discovery.capId || undefined;
                finalInnerId = finalInnerId || discovery.innerId || undefined;
            }
        }

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

        // Validation: Ensure sufficient source stock
        await this.ensureSufficientStock(
            productId,
            fromState,
            quantityToUnpack,
            factory,
            finalCapId || null,
            finalInnerId || null,
            fromState === 'finished' ? unitType : 'packet'
        );

        // 2. Deduct Source atomically
        const { error: deductError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factory,
            p_state: fromState,
            p_quantity_change: -quantityToUnpack,
            p_cap_id: finalCapId || null,
            p_inner_id: finalInnerId || null,
            p_unit_type: fromState === 'finished' ? unitType : 'packet'
        });

        if (deductError) throw new Error(`Failed to deduct ${fromState} stock: ${deductError.message}`);

        // 3. Add to Target atomically
        const targetCapId = toState === 'semi_finished' ? null : (finalCapId || null);
        const targetInnerId = toState === 'semi_finished' ? null : (finalInnerId || null);

        const { error: addError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factory,
            p_state: toState,
            p_quantity_change: yieldQuantity,
            p_cap_id: targetCapId,
            p_inner_id: targetInnerId,
            p_unit_type: toState === 'packed' ? 'packet' : 'loose'
        });

        if (addError) {
            // Rollback deduction if add fails
            await supabase.rpc('adjust_stock', {
                p_product_id: productId,
                p_factory_id: factory,
                p_state: fromState,
                p_quantity_change: quantityToUnpack,
                p_cap_id: finalCapId || null,
                p_inner_id: finalInnerId || null,
                p_unit_type: fromState === 'finished' ? unitType : 'packet'
            });
            throw new Error(`Failed to add ${toState} stock: ${addError.message}`);
        }

        // Log Transaction
        await this.logTransaction('unpack', productId, quantityToUnpack, fromState === 'finished' ? unitType : 'packet', fromState, toState, factory, undefined, `Unpacked ${quantityToUnpack} ${fromState === 'finished' ? unitType : 'packet'} yielding ${yieldQuantity} ${toState === 'packed' ? 'packets' : 'loose items'}`, false, undefined, undefined, userId, finalCapId, finalInnerId);

        // 4. Return Caps ONLY if target is semi_finished (loose items — caps removed from product)
        if (toState === 'semi_finished') {
            const productTemplates = (productDetails as any).product_templates;
            const capTemplateId = Array.isArray(productTemplates) ? productTemplates[0]?.cap_template_id : productTemplates?.cap_template_id;
            const returnCapId = finalCapId || (capTemplateId ? await findCapVariantByTemplate(capTemplateId, productDetails.color, factory) : null);
            if (returnCapId) {
                await this.addCapInventory(
                    returnCapId,
                    yieldQuantity,
                    factory,
                    `Return for unpacking ${quantityToUnpack} ${fromState === 'finished' ? unitType : 'packet'} of ${productId}`
                );
            }

            const innerTemplateId = Array.isArray(productTemplates) ? productTemplates[0]?.inner_template_id : productTemplates?.inner_template_id;
            const returnInnerId = finalInnerId || (innerTemplateId ? await findInnerVariantByTemplate(innerTemplateId, factory) : null);
            if (returnInnerId) {
                await this.addInnerInventory(
                    returnInnerId,
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
        total_cost?: number,
        userId?: string,
        capId?: string,
        innerId?: string
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
            total_cost,
            created_by: userId,
            cap_id: capId,
            inner_id: innerId
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
            p_quantity_change: -quantity,
            p_state: 'finished',
            p_unit_type: 'loose'
        });

        if (error) throw new Error(`Cap stock deduction error: ${error.message}`);
        logger.info(`Deducted ${quantity} caps (ID: ${capId}) for ${note}`);
    }

    private async deductInnerInventory(innerId: string, quantity: number, factoryId: string, note?: string) {
        const { error } = await supabase.rpc('adjust_inner_stock', {
            p_inner_id: innerId,
            p_factory_id: factoryId,
            p_quantity_change: -quantity,
            p_state: 'finished',
            p_unit_type: 'loose'
        });

        if (error) throw new Error(`Inner stock deduction error: ${error.message}`);
        logger.info(`Deducted ${quantity} inners (ID: ${innerId}) for ${note}`);
    }


    private async addCapInventory(capId: string, quantity: number, factoryId: string, note?: string) {
        const { error } = await supabase.rpc('adjust_cap_stock', {
            p_cap_id: capId,
            p_factory_id: factoryId,
            p_quantity_change: quantity,
            p_state: 'finished',
            p_unit_type: 'loose'
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

    private async addInnerInventory(innerId: string, quantity: number, factoryId: string, note?: string) {
        const { error } = await supabase.rpc('adjust_inner_stock', {
            p_inner_id: innerId,
            p_factory_id: factoryId,
            p_quantity_change: quantity,
            p_state: 'finished',
            p_unit_type: 'loose'
        });

        if (error) throw new Error(`Inner stock addition error: ${error.message}`);

        await this.logTransaction(
            'inner_return',
            null,
            quantity,
            'packet',
            null,
            'semi_finished',
            factoryId,
            innerId,
            note || `Returned ${quantity} inners`
        );

        logger.info(`Returned ${quantity} inners (ID: ${innerId}) for ${note}`);
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
        // 1. Fetch main product stock
        let mainQuery = supabase
            .from('stock_balances')
            .select(`
                *,
                products(name, size, color, selling_price, factory_id)
            `)
            .in('state', ['finished', 'packed', 'semi_finished'])
            .order('product_id');

        if (factoryId) {
            mainQuery = mainQuery.eq('factory_id', factoryId);
        }

        // 2. Fetch standalone cap stock
        let capQuery = supabase
            .from('cap_stock_balances')
            .select(`
                *,
                caps(name, color, factory_id)
            `)
            .in('state', ['finished', 'packed', 'semi_finished']);

        if (factoryId) {
            capQuery = capQuery.eq('factory_id', factoryId);
        }

        // 3. Fetch standalone inner stock - (Inners don't have 'name' directly, removing join)
        let innerQuery = supabase
            .from('inner_stock_balances')
            .select(`
                *
            `)
            .in('state', ['finished', 'packed', 'semi_finished']);

        if (factoryId) {
            innerQuery = innerQuery.eq('factory_id', factoryId);
        }


        const [mainRes, capRes, innerRes] = await Promise.all([
            mainQuery,
            capQuery,
            innerQuery
        ]);

        if (mainRes.error) throw new Error(mainRes.error.message);
        if (capRes.error) throw new Error(capRes.error.message);
        if (innerRes.error) throw new Error(innerRes.error.message);

        // Merge and return
        return [
            ...(mainRes.data || []),
            ...(capRes.data || []),
            ...(innerRes.data || [])
        ];
    }


    async adjustStock(data: {
        product_id: string;
        cap_id?: string | null;
        inner_id?: string | null;
        factory_id: string;
        state: 'semi_finished' | 'packed' | 'finished';
        unit_type: 'loose' | 'packet' | 'bundle' | 'bag' | 'box';
        quantity: number;
        reason: string;
        type: 'increment' | 'decrement';
        userId?: string;
    }) {
        const { product_id, cap_id, inner_id, factory_id, state, unit_type, quantity, reason, type, userId } = data;

        const quantityChange = type === 'increment' ? quantity : -quantity;

        const { error } = await supabase.rpc('adjust_stock', {
            p_product_id: product_id,
            p_factory_id: factory_id,
            p_state: state,
            p_quantity_change: quantityChange,
            p_cap_id: sanitizeUUID(cap_id),
            p_inner_id: sanitizeUUID(inner_id),
            p_unit_type: unit_type === 'loose' ? '' : unit_type
        });

        if (error) throw new Error(`Stock adjustment failed: ${error.message}`);

        // Log Transaction
        await this.logTransaction(
            type === 'increment' ? 'adjustment_in' : 'adjustment_out',
            product_id,
            quantity,
            unit_type === 'loose' ? '' : unit_type,
            state,
            state,
            factory_id,
            cap_id || undefined,
            reason,
            false,
            undefined,
            undefined,
            userId
        );

        return { success: true };
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

    async quickDefine(data: {
        type: 'product' | 'cap' | 'inner';
        templateId?: string;
        templateName?: string;
        size?: string;
        color?: string;
        factoryId: string;
    }) {
        const { type, templateId, templateName, size, color, factoryId } = data;

        // IMPORTING SERVICES LATE to avoid circular dependencies if any
        const { productService } = require('../products/product.service');
        const { capService } = require('./cap.service');
        const { innerService } = require('./inner.service');

        let resolvedTemplateId = templateId;

        // 1. Handle Missing Template
        if (!templateId && templateName) {
            if (type === 'product') {
                const template = await productService.quickDefineTemplate(templateName, size || 'N/A', factoryId);
                resolvedTemplateId = template.id;
            } else if (type === 'cap') {
                const template = await capService.quickDefineTemplate(templateName, factoryId);
                resolvedTemplateId = template.id;
            } else if (type === 'inner') {
                const template = await innerService.quickDefineTemplate(templateName, factoryId);
                resolvedTemplateId = template.id;
            }
        }

        if (!resolvedTemplateId) {
            throw new Error('Template ID or Template Name is required');
        }

        // 2. Create Variant
        if (type === 'product') {
            return await productService.quickDefineVariant(resolvedTemplateId, color || 'N/A', factoryId);
        } else if (type === 'cap') {
            return await capService.quickDefineVariant(resolvedTemplateId, color || 'N/A', factoryId);
        } else if (type === 'inner') {
            return await innerService.quickDefineVariant(resolvedTemplateId, color || 'N/A', factoryId);
        }

        throw new Error('Invalid define type');
    }

    async getTransactions(filters?: { productId?: string; factoryId?: string; page?: number; size?: number }) {
        const from = filters?.page && filters?.size ? (filters.page - 1) * filters.size : 0;
        const to = filters?.page && filters?.size ? from + filters.size - 1 : 19; // Default 20

        let query = supabase
            .from('inventory_transactions')
            .select(`
                *,
                products(name, size, color)
            `, { count: 'exact' })
            .order('created_at', { ascending: false });

        if (filters?.productId) {
            query = query.eq('product_id', filters.productId);
        }

        if (filters?.factoryId) {
            query = query.eq('factory_id', filters.factoryId);
        }

        const { data, error, count } = await query.range(from, to);

        if (error) throw new Error(error.message);
        return {
            transactions: data,
            pagination: {
                total: count,
                page: filters?.page || 1,
                size: filters?.size || 20
            }
        };
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

    async adjustRawMaterial(id: string, data: { quantity: number; unit: 'bags' | 'kg' | 'tons'; rate_per_kg: number; reason: string; payment_mode?: 'Cash' | 'Credit'; date?: string }, userId?: string) {
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
            totalCost,
            userId
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

    async getProductionHistory(filters: {
        factoryId?: string;
        userId?: string;
        itemType?: string;
        actionType?: string;
        startDate?: string;
        endDate?: string;
        page?: number;
        size?: number;
    }) {
        const { factoryId, userId, itemType, actionType, startDate, endDate, page = 1, size = 20 } = filters;
        const { from, to } = getPagination(page, size);

        let query = supabase
            .from('unified_production_history')
            .select('*', { count: 'exact' });

        if (factoryId) query = query.eq('factory_id', factoryId);
        if (userId) query = query.eq('user_id', userId);
        if (itemType) query = query.eq('item_type', itemType);
        if (actionType) query = query.eq('action_type', actionType);
        if (startDate) query = query.gte('timestamp', startDate);
        if (endDate) query = query.lte('timestamp', endDate);

        const { data, error, count } = await query
            .order('timestamp', { ascending: false })
            .range(from, to);

        if (error) throw error;

        return {
            logs: data,
            pagination: {
                total: count,
                page,
                size,
                totalPages: Math.ceil((count || 0) / size)
            }
        };
    }

    /**
     * One-time bulk initialization of inventory levels
     */
    async bulkInitializeInventory(data: BulkInitDTO) {
        const { factoryId, userId, items } = data;
        logger.info(`Starting bulk stock initialization for factory: ${factoryId} by user: ${userId}`);

        const results = [];

        for (const item of items) {
            try {
                if (item.type === 'raw_material') {
                    const { error } = await supabase
                        .from('raw_materials')
                        .update({ stock_weight_kg: item.quantity })
                        .eq('id', item.id)
                        .eq('factory_id', factoryId);
                    
                    if (error) throw error;
                    
                    await this.logTransaction('initial_load', item.id, item.quantity, 'kg', 'none', 'raw_material', factoryId, undefined, undefined, true, undefined, undefined, userId);
                } 
                else if (item.type === 'product') {
                    const { error } = await supabase
                        .from('stock_balances')
                        .upsert({
                            product_id: item.id,
                            factory_id: factoryId,
                            state: item.state || 'packed',
                            unit_type: item.unit_type || '',
                            quantity: item.quantity,
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'product_id,factory_id,state,unit_type,cap_id,inner_id'
                        });

                    if (error) throw error;
                    
                    await this.logTransaction('initial_load', item.id, item.quantity, item.unit_type || 'units', 'none', item.state || 'packed', factoryId, undefined, undefined, false, undefined, undefined, userId);
                }
                else if (item.type === 'cap') {
                    const { error } = await supabase
                        .from('cap_stock_balances')
                        .upsert({
                            cap_id: item.id,
                            factory_id: factoryId,
                            quantity: item.quantity,
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'cap_id,factory_id'
                        });

                    if (error) throw error;
                    await this.logTransaction('initial_load', null, item.quantity, 'caps', 'none', 'cap_stock', factoryId, undefined, undefined, false, undefined, undefined, userId, item.id);
                }
                else if (item.type === 'inner') {
                    const { error } = await supabase
                        .from('inner_stock_balances')
                        .upsert({
                            inner_id: item.id,
                            factory_id: factoryId,
                            quantity: item.quantity,
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'inner_id,factory_id'
                        });

                    if (error) throw error;
                    // Fix: logTransaction(..., capId, innerId)
                    await this.logTransaction('initial_load', null, item.quantity, 'inners', 'none', 'inner_stock', factoryId, undefined, undefined, false, undefined, undefined, userId, undefined, item.id);
                }

                results.push({ id: item.id, type: item.type, success: true });
            } catch (err: any) {
                logger.error(`Failed to initialize ${item.type} ${item.id}:`, err);
                results.push({ id: item.id, type: item.type, success: false, error: err.message });
            }
        }

        return results;
    }
}

export const inventoryService = new InventoryService();

