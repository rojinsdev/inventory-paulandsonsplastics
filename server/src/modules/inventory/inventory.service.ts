import { supabase } from '../../config/supabase';
import { SettingsService } from '../settings/settings.service';

// Helper to get product packing details
async function getProductPackingDetails(productId: string) {
    const { data, error } = await supabase
        .from('products')
        .select('items_per_packet, packets_per_bundle')
        .eq('id', productId)
        .single();

    if (error || !data) throw new Error('Product not found for packing details');
    return data;
}

export class InventoryService {

    // 1. Pack: Semi-Finished (Loose) -> Packed (Packets)
    async packItems(productId: string, packetsCreated: number) {
        const { items_per_packet } = await getProductPackingDetails(productId);

        // Get default items per packet from settings if product doesn't specify
        const defaultItemsPerPacket = await SettingsService.getValue<number>('default_items_per_packet') || 12;
        const requiredLooseItems = packetsCreated * (items_per_packet || defaultItemsPerPacket);

        // Check if we have enough semi_finished stock
        const { data: stock } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'semi_finished')
            .single();

        if (!stock || stock.quantity < requiredLooseItems) {
            throw new Error(`Insufficient semi-finished stock. Need ${requiredLooseItems}, have ${stock?.quantity || 0}`);
        }

        // Deduct Semi-Finished
        await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'semi_finished',
            quantity: stock.quantity - requiredLooseItems
        });

        // Add Packed
        // Fetch existing packed
        const { data: packedStock } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'packed')
            .single();

        await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'packed',
            quantity: (packedStock?.quantity || 0) + packetsCreated // We store PACKETS count in 'packed' state? 
            // OR do we store generic "units"?
            // Decision: Store EVERYTHING in Base Units (Pieces) for consistency?
            // "Semi-Finished" = Pieces.
            // "Packed" = Packets? NO, if we store packets, we lose the 'base unit' continuity easily.
            // BUT, if we store pieces, it's hard to know how many "Packets".
            // Let's store "Quantity" as the COUNT of the item in that state.
            // State: Semi-Finshed -> Qty = 1000 (Pieces)
            // State: Packed -> Qty = 10 (Packets)
            // State: Finished -> Qty = 5 (Bundles)
            // This is safer for the UI (Production Manager counts Packets, not pieces inside).
        });

        // Log Transaction
        await this.logTransaction('pack', productId, packetsCreated, 'semi_finished', 'packed');
    }

    // 2. Bundle: Packed (Packets) -> Finished (Bundles)
    async bundlePackets(productId: string, bundlesCreated: number) {
        const { packets_per_bundle } = await getProductPackingDetails(productId);
        const requiredPackets = bundlesCreated * (packets_per_bundle || 50);

        // Check Packed Stock
        const { data: stock } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'packed')
            .single();

        if (!stock || stock.quantity < requiredPackets) {
            throw new Error(`Insufficient packed stock. Need ${requiredPackets} packets, have ${stock?.quantity || 0}`);
        }

        // Deduct Packed
        await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'packed',
            quantity: stock.quantity - requiredPackets
        });

        // Add Finished
        const { data: finishedStock } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'finished')
            .single();

        await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'finished',
            quantity: (finishedStock?.quantity || 0) + bundlesCreated
        });

        // Log Transaction
        await this.logTransaction('bundle', productId, bundlesCreated, 'packed', 'finished');
    }

    private async logTransaction(type: string, productId: string, qty: number, from: string, to: string) {
        await supabase.from('inventory_transactions').insert({
            transaction_type: type,
            product_id: productId,
            quantity: qty,
            from_state: from,
            to_state: to,
            notes: `Converted ${qty} units via ${type}`
        });
    }

    async getStock(productId: string) {
        const { data } = await supabase
            .from('stock_balances')
            .select('*')
            .eq('product_id', productId);
        return data;
    }

    async getAllStock() {
        const { data, error } = await supabase
            .from('stock_balances')
            .select(`
                *,
                products(name, size, color, selling_price)
            `)
            .order('product_id');

        if (error) throw new Error(error.message);
        return data;
    }

    async getAvailableStock() {
        const { data, error } = await supabase
            .from('stock_balances')
            .select(`
                *,
                products(name, size, color, selling_price)
            `)
            .eq('state', 'finished')
            .order('product_id');

        if (error) throw new Error(error.message);
        return data;
    }

    // Raw Materials Methods
    async getRawMaterials() {
        const { data, error } = await supabase
            .from('raw_materials')
            .select('*')
            .order('name');

        if (error) throw new Error(error.message);
        return data;
    }

    async adjustRawMaterial(id: string, adjustment: number, reason: string) {
        // Get current stock
        const { data: current, error: fetchError } = await supabase
            .from('raw_materials')
            .select('stock_weight_kg')
            .eq('id', id)
            .single();

        if (fetchError || !current) throw new Error('Raw material not found');

        const newQuantity = current.stock_weight_kg + adjustment;
        if (newQuantity < 0) throw new Error('Cannot reduce below zero');

        const { data, error } = await supabase
            .from('raw_materials')
            .update({
                stock_weight_kg: newQuantity,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return data;
    }

    async createRawMaterial(name: string, stockWeight: number) {
        const { data, error } = await supabase
            .from('raw_materials')
            .insert({
                name,
                stock_weight_kg: stockWeight,
                min_threshold_kg: 100, // Default for new materials
                type: 'Granule'
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') throw new Error('Material with this name already exists');
            throw new Error(error.message);
        }

        // Log creation
        await supabase.from('audit_logs').insert({
            action: 'CREATE_RAW_MATERIAL',
            entity_type: 'raw_materials',
            entity_id: data.id,
            details: `Created material: ${name} with initial stock: ${stockWeight}kg`
        });

        return data;
    }
}

export const inventoryService = new InventoryService();

