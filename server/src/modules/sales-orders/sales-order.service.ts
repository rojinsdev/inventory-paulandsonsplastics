import { supabase } from '../../config/supabase';

export interface CreateSalesOrderDTO {
    customer_id: string;
    items: Array<{
        product_id: string;
        quantity_bundles: number;
    }>;
    notes?: string;
}

export interface UpdateOrderStatusDTO {
    status: 'reserved' | 'delivered' | 'cancelled';
}

export class SalesOrderService {
    async createOrder(data: CreateSalesOrderDTO) {
        // Start a transaction-like approach
        // 1. Create the order
        const { data: order, error: orderError } = await supabase
            .from('sales_orders')
            .insert({
                customer_id: data.customer_id,
                status: 'reserved',
                notes: data.notes,
            })
            .select()
            .single();

        if (orderError) throw new Error(orderError.message);

        // 2. Create order items and reserve stock
        for (const item of data.items) {
            // Create order item
            const { error: itemError } = await supabase
                .from('sales_order_items')
                .insert({
                    sales_order_id: order.id,
                    product_id: item.product_id,
                    quantity_bundles: item.quantity_bundles,
                });

            if (itemError) {
                // Rollback: delete the order
                await supabase.from('sales_orders').delete().eq('id', order.id);
                throw new Error(`Failed to create order item: ${itemError.message}`);
            }

            // Reserve stock: Move from 'finished' to 'reserved'
            try {
                await this.reserveStock(item.product_id, item.quantity_bundles);
            } catch (error: any) {
                // Rollback: delete order and items
                await supabase.from('sales_orders').delete().eq('id', order.id);
                throw new Error(`Stock reservation failed: ${error.message}`);
            }
        }

        // Return full order with items
        return this.getOrderById(order.id);
    }

    private async reserveStock(productId: string, quantityBundles: number) {
        // Get finished stock
        const { data: finishedStock } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'finished')
            .single();

        const currentFinished = finishedStock?.quantity || 0;

        if (currentFinished < quantityBundles) {
            throw new Error(`Insufficient stock. Need ${quantityBundles}, have ${currentFinished}`);
        }

        // Deduct from finished
        await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'finished',
            quantity: currentFinished - quantityBundles,
        });

        // Get reserved stock
        const { data: reservedStock } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'reserved')
            .single();

        // Add to reserved
        await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'reserved',
            quantity: (reservedStock?.quantity || 0) + quantityBundles,
        });
    }

    private async unreserveStock(productId: string, quantityBundles: number) {
        // Move stock back from reserved to finished
        const { data: reservedStock } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'reserved')
            .single();

        await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'reserved',
            quantity: (reservedStock?.quantity || 0) - quantityBundles,
        });

        const { data: finishedStock } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'finished')
            .single();

        await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'finished',
            quantity: (finishedStock?.quantity || 0) + quantityBundles,
        });
    }

    private async deliverStock(productId: string, quantityBundles: number) {
        // Permanently remove from reserved (stock is sold)
        const { data: reservedStock } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'reserved')
            .single();

        await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'reserved',
            quantity: (reservedStock?.quantity || 0) - quantityBundles,
        });
    }

    async getAllOrders() {
        const { data, error } = await supabase
            .from('sales_orders')
            .select(`
                *,
                customers(name, phone, type),
                sales_order_items(
                    id,
                    product_id,
                    quantity_bundles,
                    products(name, size, color, selling_price)
                )
            `)
            .order('order_date', { ascending: false });

        if (error) throw new Error(error.message);
        return data;
    }

    async getOrderById(id: string) {
        const { data, error } = await supabase
            .from('sales_orders')
            .select(`
                *,
                customers(name, phone, type),
                sales_order_items(
                    id,
                    product_id,
                    quantity_bundles,
                    products(name, size, color, selling_price)
                )
            `)
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return data;
    }

    async updateOrderStatus(id: string, status: 'reserved' | 'delivered' | 'cancelled') {
        const order = await this.getOrderById(id);

        if (status === 'delivered' && order.status !== 'reserved') {
            throw new Error('Can only deliver orders that are reserved');
        }

        if (status === 'cancelled' && order.status === 'delivered') {
            throw new Error('Cannot cancel delivered orders');
        }

        // Handle stock movements
        if (status === 'delivered') {
            // Permanently deduct reserved stock
            for (const item of order.sales_order_items) {
                await this.deliverStock(item.product_id, item.quantity_bundles);
            }
        } else if (status === 'cancelled') {
            // Return stock to finished
            for (const item of order.sales_order_items) {
                await this.unreserveStock(item.product_id, item.quantity_bundles);
            }
        }

        // Update order status
        const { data, error } = await supabase
            .from('sales_orders')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return this.getOrderById(id);
    }

    async deleteOrder(id: string) {
        // Can only delete cancelled orders or reserved orders
        const order = await this.getOrderById(id);

        if (order.status === 'delivered') {
            throw new Error('Cannot delete delivered orders');
        }

        if (order.status === 'reserved') {
            // Unreserve stock first
            for (const item of order.sales_order_items) {
                await this.unreserveStock(item.product_id, item.quantity_bundles);
            }
        }

        const { error } = await supabase
            .from('sales_orders')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { message: 'Order deleted successfully' };
    }
}

export const salesOrderService = new SalesOrderService();
