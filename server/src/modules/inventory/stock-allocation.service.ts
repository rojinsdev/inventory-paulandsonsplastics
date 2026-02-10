import { supabase } from '../../config/supabase';

const MAIN_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';

export class StockAllocationService {
    /**
     * Smart FIFO Allocation
     * Triggered when stock increases in a "ready" state (semi_finished, packed, finished)
     */
    async allocateStock(productId: string, state: string, availableQty: number, factoryId: string) {
        const unitTypeMapping: Record<string, string> = {
            'semi_finished': 'loose',
            'packed': 'packet',
            'finished': 'bundle'
        };
        const unitType = unitTypeMapping[state];
        if (!unitType) return;

        // 1. Fetch oldest backordered items for this product and unit type
        const { data: backorders, error } = await supabase
            .from('sales_order_items')
            .select(`
                id,
                quantity,
                unit_type,
                order_id,
                sales_orders!inner(id, user_id)
            `)
            .eq('product_id', productId)
            .eq('unit_type', unitType)
            .eq('is_backordered', true)
            .order('created_at', { ascending: true });

        if (error || !backorders || backorders.length === 0) return;

        let remainingStock = availableQty;

        for (const item of backorders) {
            if (remainingStock <= 0) break;

            if (remainingStock >= item.quantity) {
                // Fulfill this item in full
                const amountToAllocate = item.quantity;

                await this.reserveFulfillment(productId, state, amountToAllocate, factoryId);

                await supabase
                    .from('sales_order_items')
                    .update({ is_backordered: false })
                    .eq('id', item.id);

                // Update production request progress
                await this.updateProductionRequest(item.order_id, productId, amountToAllocate);

                // Notify Admin (Handle possible array or object response from Supabase)
                const orderOwnerId = Array.isArray(item.sales_orders)
                    ? item.sales_orders[0]?.user_id
                    : (item.sales_orders as any)?.user_id;

                if (orderOwnerId) {
                    await this.notifyfulfillment(orderOwnerId, item.order_id, productId, amountToAllocate, unitType);
                }

                remainingStock -= amountToAllocate;
            } else {
                // Partial fulfillment - for now we wait for enough stock to fulfill full item
                // or we could satisfy it partially if we had a more complex reserved/delivered state per item.
                // Given the instructions, we prioritize full FIFO.
                break;
            }
        }
    }

    private async reserveFulfillment(productId: string, fromState: string, quantity: number, factoryId: string) {
        // Deduct from source state
        const { data: sourceStock } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', fromState)
            .eq('factory_id', factoryId)
            .single();

        await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: fromState,
            factory_id: factoryId,
            quantity: (sourceStock?.quantity || 0) - quantity,
            last_updated: new Date().toISOString()
        }, { onConflict: 'product_id,state,factory_id' });

        // Add to reserved
        const { data: reservedStock } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'reserved')
            .eq('factory_id', factoryId)
            .single();

        await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'reserved',
            factory_id: factoryId,
            quantity: (reservedStock?.quantity || 0) + quantity,
            last_updated: new Date().toISOString()
        }, { onConflict: 'product_id,state,factory_id' });
    }

    private async updateProductionRequest(orderId: string, productId: string, quantitySatisfied: number) {
        const { data: requests } = await supabase
            .from('production_requests')
            .select('id, quantity, status')
            .eq('sales_order_id', orderId)
            .eq('product_id', productId)
            .eq('status', 'pending');

        if (requests && requests.length > 0) {
            for (const req of requests) {
                // Mark request as completed if satisfied
                // (This is a simplified view, assuming 1 request per order item)
                await supabase
                    .from('production_requests')
                    .update({ status: 'completed' })
                    .eq('id', req.id);
            }
        }
    }

    private async notifyfulfillment(userId: string, orderId: string, productId: string, quantity: number, unitType: string) {
        const { data: product } = await supabase.from('products').select('name').eq('id', productId).single();

        await supabase.from('notifications').insert({
            user_id: userId,
            title: 'Backorder Fulfilled',
            message: `Stock for Order #${orderId.slice(-6).toUpperCase()} is now ready: ${quantity} ${unitType} of ${product?.name}.`,
            type: 'backorder_fulfillment',
            metadata: { order_id: orderId, product_id: productId }
        });
    }
}

export const stockAllocationService = new StockAllocationService();
