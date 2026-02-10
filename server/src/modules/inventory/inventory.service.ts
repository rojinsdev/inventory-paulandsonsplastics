import { supabase } from '../../config/supabase';
import { SettingsService } from '../settings/settings.service';
import { stockAllocationService } from './stock-allocation.service';
import { cashFlowService } from '../cash-flow/cash-flow.service';

// Helper to get product packing details
async function getProductPackingDetails(productId: string) {
    const { data, error } = await supabase
        .from('products')
        .select('items_per_packet, packets_per_bundle, items_per_bundle, factory_id, cap_id')
        .eq('id', productId)
        .single();

    if (error || !data) throw new Error('Product not found for packing details');
    return data;
}

const MAIN_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';

export class InventoryService {

    // 1. Pack: Semi-Finished (Loose) -> Packed (Packets)
    async packItems(productId: string, packetsCreated: number) {
        const { items_per_packet, factory_id, cap_id } = await getProductPackingDetails(productId);
        const factory = factory_id || MAIN_FACTORY_ID;

        // Get default items per packet from settings if product doesn't specify
        const defaultItemsPerPacket = await SettingsService.getValue<number>('default_items_per_packet') || 12;
        const requiredLooseItems = packetsCreated * (items_per_packet || defaultItemsPerPacket);

        // Check if we have enough semi_finished stock
        const { data: stock, error: fetchError } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'semi_finished')
            .eq('factory_id', factory)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') throw new Error(fetchError.message);
        if (!stock || stock.quantity < requiredLooseItems) {
            throw new Error(`Insufficient semi-finished stock. Need ${requiredLooseItems}, have ${stock?.quantity || 0}`);
        }

        // Deduct Semi-Finished
        const { error: deductError } = await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'semi_finished',
            factory_id: factory,
            quantity: stock.quantity - requiredLooseItems,
            last_updated: new Date().toISOString()
        }, { onConflict: 'product_id,state,factory_id' });

        if (deductError) throw new Error(`Failed to deduct semi-finished stock: ${deductError.message}`);

        // Add Packed
        const { data: packedStock, error: fetchPackedError } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'packed')
            .eq('factory_id', factory)
            .single();

        if (fetchPackedError && fetchPackedError.code !== 'PGRST116') throw new Error(fetchPackedError.message);

        const { error: addError } = await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'packed',
            factory_id: factory,
            quantity: (packedStock?.quantity || 0) + packetsCreated,
            last_updated: new Date().toISOString()
        }, { onConflict: 'product_id,state,factory_id' });

        if (addError) throw new Error(`Failed to add packed stock: ${addError.message}`);

        // ================== SMART QUEUE ALLOCATION ==================
        await stockAllocationService.allocateStock(productId, 'packed', packetsCreated, factory);

        // Log Transaction
        await this.logTransaction('pack', productId, packetsCreated, 'packet', 'semi_finished', 'packed', factory);

        // Deduct Cap if mapped
        if (cap_id) {
            await this.deductCapInventory(cap_id, requiredLooseItems, factory, `Deduction for packing ${packetsCreated} packets of ${productId}`);
        }
    }

    // 2. Bundle: Packed (Packets) OR Semi-Finished (Loose) -> Finished (Bundles)
    async bundlePackets(productId: string, bundlesCreated: number, source: 'packed' | 'semi_finished' = 'packed') {
        const { packets_per_bundle, items_per_bundle, factory_id, cap_id } = await getProductPackingDetails(productId);
        const factory = factory_id || MAIN_FACTORY_ID;

        let requiredQuantity: number;
        const sourceState = source;

        if (source === 'packed') {
            requiredQuantity = bundlesCreated * (packets_per_bundle || 50);
        } else {
            // Loose -> Bundle
            const defaultItemsPerBundle = 600; // packets_per_bundle(50) * items_per_packet(12)
            requiredQuantity = bundlesCreated * (items_per_bundle || defaultItemsPerBundle);
        }

        // Check Source Stock
        const { data: stock, error: fetchError } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', sourceState)
            .eq('factory_id', factory)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') throw new Error(fetchError.message);
        if (!stock || stock.quantity < requiredQuantity) {
            const unit = source === 'packed' ? 'packets' : 'loose items';
            throw new Error(`Insufficient ${sourceState} stock. Need ${requiredQuantity} ${unit}, have ${stock?.quantity || 0}`);
        }

        // Deduct Source
        const { error: deductError } = await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: sourceState,
            factory_id: factory,
            quantity: stock.quantity - requiredQuantity,
            last_updated: new Date().toISOString()
        }, { onConflict: 'product_id,state,factory_id' });

        if (deductError) throw new Error(`Failed to deduct ${sourceState} stock: ${deductError.message}`);

        // Add Finished
        const { data: finishedStock, error: fetchFinishedError } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'finished')
            .eq('factory_id', factory)
            .single();

        if (fetchFinishedError && fetchFinishedError.code !== 'PGRST116') throw new Error(fetchFinishedError.message);

        const { error: addError } = await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'finished',
            factory_id: factory,
            quantity: (finishedStock?.quantity || 0) + bundlesCreated,
            last_updated: new Date().toISOString()
        }, { onConflict: 'product_id,state,factory_id' });

        if (addError) throw new Error(`Failed to add finished stock: ${addError.message}`);

        // ================== SMART QUEUE ALLOCATION ==================
        await stockAllocationService.allocateStock(productId, 'finished', bundlesCreated, factory);

        // Log Transaction
        const unitType = source === 'packed' ? 'packet' : 'loose';
        await this.logTransaction('bundle', productId, bundlesCreated, 'bundle', sourceState, 'finished', factory);

        // Deduct Cap ONLY if sourcing from loose (since packed items already had caps deducted)
        if (source === 'semi_finished' && cap_id) {
            await this.deductCapInventory(cap_id, requiredQuantity, factory, `Deduction for direct bundling ${bundlesCreated} bundles of ${productId}`);
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
            console.error('⚠️ Failed to log inventory transaction:', error.message);
            throw new Error(`Inventory transaction logging failed: ${error.message}`);
        }
    }

    private async deductCapInventory(capId: string, quantity: number, factoryId: string, note?: string) {
        // 1. Get current balance
        const { data: stock, error: fetchError } = await supabase
            .from('cap_stock_balances')
            .select('quantity')
            .eq('cap_id', capId)
            .eq('factory_id', factoryId)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') throw new Error(`Cap stock fetch error: ${fetchError.message}`);

        const currentQty = stock?.quantity || 0;
        if (currentQty < quantity) {
            // We allow negative stock for caps as per usual business logic if needed, 
            // but let's warn or throw based on preference. 
            // Most inventory systems here throw.
            throw new Error(`Insufficient cap stock. Need ${quantity}, have ${currentQty}`);
        }

        // 2. Update balance
        const { error: updateError } = await supabase
            .from('cap_stock_balances')
            .upsert({
                cap_id: capId,
                factory_id: factoryId,
                quantity: currentQty - quantity,
                last_updated: new Date().toISOString()
            }, { onConflict: 'cap_id,factory_id' });

        if (updateError) throw new Error(`Cap stock deduction error: ${updateError.message}`);

        // 3. Log (optional - maybe add a cap_inventory_transactions table? or just use general one)
        // For now, let's just log to console or general audit if needed.
        console.log(`✅ Deducted ${quantity} caps (ID: ${capId}) for ${note}`);
    }

    async getStock(productId: string) {
        const { data } = await supabase
            .from('stock_balances')
            .select('*')
            .eq('product_id', productId);
        return data;
    }

    async getAllStock(factoryId?: string) {
        let query = supabase
            .from('stock_balances')
            .select(`
                *,
                products(name, size, color, selling_price, factory_id)
            `)
            .order('product_id');

        // Filter by factory if provided
        if (factoryId) {
            query = query.eq('products.factory_id', factoryId);
        }

        const { data, error } = await query;

        if (error) throw new Error(error.message);
        return data;
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
        // 1. Get products (factory-specific + global products)
        let productQuery = supabase.from('products').select('id, name, size, color, factory_id');
        if (factoryId) {
            // Include products that either belong to this factory OR are global (null factory_id)
            productQuery = productQuery.or(`factory_id.eq.${factoryId},factory_id.is.null`);
        }
        const { data: products, error: pError } = await productQuery;
        if (pError) throw new Error(pError.message);

        // 2. Get all balances for this factory
        let balanceQuery = supabase.from('stock_balances').select('*');
        if (factoryId) {
            balanceQuery = balanceQuery.eq('factory_id', factoryId);
        }
        const { data: balances, error: bError } = await balanceQuery;
        if (bError) throw new Error(bError.message);

        // 3. Aggregate
        const overview = products.map(product => {
            const productBalances = balances.filter(b => b.product_id === product.id);
            const semiFinished = productBalances.find(b => b.state === 'semi_finished')?.quantity || 0;
            const packed = productBalances.find(b => b.state === 'packed')?.quantity || 0;
            const bundled = productBalances.find(b => b.state === 'finished')?.quantity || 0;

            return {
                product_id: product.id,
                product_name: `${product.name} (${product.size})`,
                semi_finished_qty: semiFinished,
                packed_qty: packed,
                bundled_qty: bundled,
                factory_id: product.factory_id
            };
        });

        // Optional: Filter out products with 0 stock across all states if you want a cleaner summary
        // For now, return all to match the detailed view requirements
        return overview;
    }

    // Raw Materials Methods
    async getRawMaterials(factoryId?: string) {
        let query = supabase
            .from('raw_materials')
            .select('*')
            .order('name');

        // Filter by factory if provided
        if (factoryId) {
            query = query.eq('factory_id', factoryId);
        }

        const { data, error } = await query;

        if (error) throw new Error(error.message);
        return data;
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

