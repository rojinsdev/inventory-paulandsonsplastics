import { supabase } from '../../config/supabase';
import { AuditService } from '../audit/audit.service';

const auditService = new AuditService();

export interface CreateSalesOrderDTO {
    customer_id: string;
    items: Array<{
        product_id: string;
        quantity_bundles: number;
    }>;
    notes?: string;
    user_id: string; // Added: Track which admin created the order
}

export interface UpdateOrderStatusDTO {
    status: 'reserved' | 'delivered' | 'cancelled';
    user_id: string; // Added: Track which admin updated the status
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
                created_by: data.user_id, // Track which admin created the order
            })
            .select()
            .single();

        if (orderError) throw new Error(orderError.message);

        // 2. Create order items and reserve stock
        for (const item of data.items) {
            // Fetch product price for history
            const { data: product } = await supabase
                .from('products')
                .select('selling_price')
                .eq('id', item.product_id)
                .single();

            // Create order item
            const { error: itemError } = await supabase
                .from('sales_order_items')
                .insert({
                    order_id: order.id, // Column is order_id in DB
                    product_id: item.product_id,
                    quantity_bundles: item.quantity_bundles,
                    unit_price: product?.selling_price || 0, // Record price at time of sale
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
        const fullOrder = await this.getOrderById(order.id);

        // Audit logging for order creation
        await auditService.logAction(
            data.user_id,
            'create_sales_order',
            'sales_orders',
            order.id,
            {
                customer_id: data.customer_id,
                items: data.items,
                total_bundles: data.items.reduce((sum, item) => sum + item.quantity_bundles, 0)
            }
        );

        return fullOrder;
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

    async getAllOrders(filters?: { status?: string }) {
        let query = supabase
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
            `);

        if (filters?.status) {
            query = query.eq('status', filters.status);
        }

        const { data, error } = await query.order('order_date', { ascending: false });

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

    async updateOrderStatus(id: string, status: 'reserved' | 'delivered' | 'cancelled', userId: string) {
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

        // Update order status (with delivered_at timestamp if applicable)
        const updateData: any = { status };
        if (status === 'delivered') {
            updateData.delivered_at = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('sales_orders')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        // Audit logging for status change
        await auditService.logAction(
            userId,
            status === 'delivered' ? 'deliver_order' : 'cancel_order',
            'sales_orders',
            id,
            {
                previous_status: order.status,
                new_status: status,
                customer_id: order.customer_id,
                total_bundles: order.sales_order_items.reduce((sum: number, item: any) => sum + item.quantity_bundles, 0)
            }
        );

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
