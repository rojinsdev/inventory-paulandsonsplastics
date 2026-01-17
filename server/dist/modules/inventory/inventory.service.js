"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryService = exports.InventoryService = void 0;
const supabase_1 = require("../../config/supabase");
// Helper to get product packing details
async function getProductPackingDetails(productId) {
    const { data, error } = await supabase_1.supabase
        .from('products')
        .select('items_per_packet, packets_per_bundle')
        .eq('id', productId)
        .single();
    if (error || !data)
        throw new Error('Product not found for packing details');
    return data;
}
class InventoryService {
    // 1. Pack: Semi-Finished (Loose) -> Packed (Packets)
    async packItems(productId, packetsCreated) {
        const { items_per_packet } = await getProductPackingDetails(productId);
        const requiredLooseItems = packetsCreated * (items_per_packet || 100);
        // Check if we have enough semi_finished stock
        const { data: stock } = await supabase_1.supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'semi_finished')
            .single();
        if (!stock || stock.quantity < requiredLooseItems) {
            throw new Error(`Insufficient semi-finished stock. Need ${requiredLooseItems}, have ${stock?.quantity || 0}`);
        }
        // Deduct Semi-Finished
        await supabase_1.supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'semi_finished',
            quantity: stock.quantity - requiredLooseItems
        });
        // Add Packed
        // Fetch existing packed
        const { data: packedStock } = await supabase_1.supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'packed')
            .single();
        await supabase_1.supabase.from('stock_balances').upsert({
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
    async bundlePackets(productId, bundlesCreated) {
        const { packets_per_bundle } = await getProductPackingDetails(productId);
        const requiredPackets = bundlesCreated * (packets_per_bundle || 50);
        // Check Packed Stock
        const { data: stock } = await supabase_1.supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'packed')
            .single();
        if (!stock || stock.quantity < requiredPackets) {
            throw new Error(`Insufficient packed stock. Need ${requiredPackets} packets, have ${stock?.quantity || 0}`);
        }
        // Deduct Packed
        await supabase_1.supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'packed',
            quantity: stock.quantity - requiredPackets
        });
        // Add Finished
        const { data: finishedStock } = await supabase_1.supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'finished')
            .single();
        await supabase_1.supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'finished',
            quantity: (finishedStock?.quantity || 0) + bundlesCreated
        });
        // Log Transaction
        await this.logTransaction('bundle', productId, bundlesCreated, 'packed', 'finished');
    }
    async logTransaction(type, productId, qty, from, to) {
        await supabase_1.supabase.from('inventory_transactions').insert({
            transaction_type: type,
            product_id: productId,
            quantity: qty,
            from_state: from,
            to_state: to,
            notes: `Converted ${qty} units via ${type}`
        });
    }
    async getStock(productId) {
        const { data } = await supabase_1.supabase
            .from('stock_balances')
            .select('*')
            .eq('product_id', productId);
        return data;
    }
    async getAllStock() {
        const { data, error } = await supabase_1.supabase
            .from('stock_balances')
            .select(`
                *,
                products(name, size, color, selling_price)
            `)
            .order('product_id');
        if (error)
            throw new Error(error.message);
        return data;
    }
}
exports.InventoryService = InventoryService;
exports.inventoryService = new InventoryService();
