import { supabase } from '../../config/supabase';
import { AuditService } from '../audit/audit.service';
import { inventoryService } from '../inventory/inventory.service';
import { cashFlowService } from '../cash-flow/cash-flow.service';

const auditService = new AuditService();
const MAIN_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';

export interface CreateSalesOrderDTO {
    customer_id: string;
    delivery_date?: string; // Added: Delivery date requirement from user
    items: Array<{
        product_id: string;
        quantity: number;
        unit_type?: 'bundle' | 'packet' | 'loose'; // Default to bundle if not provided
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
                delivery_date: data.delivery_date, // Save delivery date
                status: 'pending',
                notes: data.notes,
                created_by: data.user_id, // Track which admin created the order
            })
            .select()
            .single();

        if (orderError) throw new Error(orderError.message);

        // 2. Create order items and reserve stock
        for (const item of data.items) {
            const unit_type = item.unit_type || 'bundle';

            // Fetch product price and factory
            const { data: product } = await supabase
                .from('products')
                .select('selling_price, factory_id')
                .eq('id', item.product_id)
                .single();

            // Check if stock is available
            const factoryId = product?.factory_id || MAIN_FACTORY_ID;
            const availableStock = await this.getAvailableStock(item.product_id, unit_type, factoryId);
            const isBackordered = availableStock < item.quantity;

            // Create order item
            const { error: itemError } = await supabase
                .from('sales_order_items')
                .insert({
                    order_id: order.id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_type: unit_type,
                    unit_price: product?.selling_price || 0,
                    is_backordered: isBackordered
                });

            if (itemError) {
                await supabase.from('sales_orders').delete().eq('id', order.id);
                throw new Error(`Failed to create order item: ${itemError.message}`);
            }

            if (!isBackordered) {
                // Reserve stock
                await this.reserveStock(item.product_id, item.quantity, unit_type, factoryId);
            } else {
                // Trigger Demand Signal (Production Request)
                const needed = item.quantity - availableStock;
                await this.createProductionRequest(item.product_id, factoryId, needed, unit_type, order.id);

                // Partially reserve if something is available
                if (availableStock > 0) {
                    await this.reserveStock(item.product_id, availableStock, unit_type, factoryId);
                }
            }
        }

        // 3. Notify Product Managers of all factories involved in this order
        const factoryIds = new Set<string>();
        for (const item of data.items) {
            const { data: p } = await supabase.from('products').select('factory_id').eq('id', item.product_id).single();
            if (p?.factory_id) factoryIds.add(p.factory_id);
        }

        for (const factoryId of factoryIds) {
            const { data: managers } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('role', 'production_manager')
                .eq('factory_id', factoryId);

            if (managers) {
                for (const manager of managers) {
                    await supabase.from('notifications').insert({
                        user_id: manager.id,
                        title: 'New Sales Order Needs Preparation',
                        message: `Order #${order.id.slice(-6).toUpperCase()} has items from your factory. Delivery scheduled for ${data.delivery_date || 'ASAP'}.`,
                        type: 'sales_order_preparation',
                        metadata: { order_id: order.id }
                    });
                }
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
                total_items: data.items.reduce((sum, item) => sum + (item.quantity || 0), 0)
            }
        );

        return fullOrder;
    }

    private async getAvailableStock(productId: string, unitType: string, factoryId: string): Promise<number> {
        const stateMapping: Record<string, string> = {
            'loose': 'semi_finished',
            'packet': 'packed',
            'bundle': 'finished'
        };

        const { data: stock, error } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', stateMapping[unitType] || 'finished')
            .eq('factory_id', factoryId)
            .single();

        if (error && error.code !== 'PGRST116') throw new Error(`Stock fetch error: ${error.message}`);
        return stock?.quantity || 0;
    }

    private async reserveStock(productId: string, quantity: number, unitType: string, factoryId: string) {
        const stateMapping: Record<string, string> = {
            'loose': 'semi_finished',
            'packet': 'packed',
            'bundle': 'finished'
        };
        const sourceState = stateMapping[unitType] || 'finished';

        // 1. Deduct from source state
        const available = await this.getAvailableStock(productId, unitType, factoryId);
        const { error: deductError } = await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: sourceState,
            factory_id: factoryId,
            quantity: available - quantity,
            last_updated: new Date().toISOString()
        }, { onConflict: 'product_id,state,factory_id' });

        if (deductError) throw new Error(`Failed to deduct ${sourceState} stock: ${deductError.message}`);

        // 2. Add to reserved state
        const { data: reservedStock } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', 'reserved')
            .eq('factory_id', factoryId)
            .single();

        const { error: reserveError } = await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'reserved',
            factory_id: factoryId,
            quantity: (reservedStock?.quantity || 0) + quantity,
            last_updated: new Date().toISOString()
        }, { onConflict: 'product_id,state,factory_id' });

        if (reserveError) throw new Error(`Failed to update reserved stock: ${reserveError.message}`);

        // 3. Log Audit Trail
        await inventoryService.logTransaction('reserve', productId, quantity, unitType, sourceState, 'reserved', factoryId);
    }

    private async createProductionRequest(productId: string, factoryId: string, quantity: number, unitType: string, orderId: string) {
        // 1. Create Request
        const { data: request, error: reqError } = await supabase
            .from('production_requests')
            .insert({
                product_id: productId,
                factory_id: factoryId,
                quantity: quantity,
                unit_type: unitType,
                sales_order_id: orderId,
                status: 'pending'
            })
            .select()
            .single();

        if (reqError) throw new Error(`Failed to create production request: ${reqError.message}`);

        // 2. Notify Production Manager
        const { data: managers } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('role', 'production_manager')
            .eq('factory_id', factoryId);

        if (managers && managers.length > 0) {
            const { data: product } = await supabase.from('products').select('name').eq('id', productId).single();
            for (const manager of managers) {
                await supabase.from('notifications').insert({
                    user_id: manager.id,
                    title: 'New Production Request',
                    message: `Demand Signal: ${quantity} units of ${product?.name} (${unitType}) needed for Order #${orderId.slice(-6).toUpperCase()}`,
                    type: 'production_request',
                    metadata: { request_id: request.id, order_id: orderId }
                });
            }
        }
    }

    private async unreserveStock(productId: string, quantity: number, unitType: string, factoryId: string) {
        const stateMapping: Record<string, string> = {
            'loose': 'semi_finished',
            'packet': 'packed',
            'bundle': 'finished'
        };
        const targetState = stateMapping[unitType] || 'finished';

        // 1. Move stock back from reserved
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
            quantity: (reservedStock?.quantity || 0) - quantity,
            last_updated: new Date().toISOString()
        }, { onConflict: 'product_id,state,factory_id' });

        // 2. Add back to original state
        const { data: sourceStock } = await supabase
            .from('stock_balances')
            .select('quantity')
            .eq('product_id', productId)
            .eq('state', targetState)
            .eq('factory_id', factoryId)
            .single();

        await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: targetState,
            factory_id: factoryId,
            quantity: (sourceStock?.quantity || 0) + quantity,
            last_updated: new Date().toISOString()
        }, { onConflict: 'product_id,state,factory_id' });

        // 3. Log Audit Trail
        await inventoryService.logTransaction('unreserve', productId, quantity, unitType, 'reserved', targetState, factoryId);
    }

    private async deliverStock(productId: string, quantity: number, factoryId: string) {
        // Permanently remove from reserved (stock is sold)
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
            quantity: (reservedStock?.quantity || 0) - quantity,
            last_updated: new Date().toISOString()
        }, { onConflict: 'product_id,state,factory_id' });

        // Log Audit Trail
        // Note: Defaulting to 'bundle' as delivery unit for now, ideally passed from caller
        await inventoryService.logTransaction('delivery', productId, quantity, 'bundle', 'reserved', null, factoryId);
    }

    async getAllOrders(filters?: { status?: string; factoryId?: string }) {
        let query = supabase
            .from('sales_orders')
            .select(`
                *,
                customers(name, phone, type),
                sales_order_items!inner(
                    id,
                    product_id,
                    quantity,
                    unit_type,
                    is_backordered,
                    is_prepared,
                    prepared_at,
                    products!inner(name, size, color, selling_price, factory_id)
                )
            `);

        if (filters?.status) {
            query = query.eq('status', filters.status);
        }

        if (filters?.factoryId) {
            query = query.eq('sales_order_items.products.factory_id', filters.factoryId);
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
                    quantity,
                    unit_type,
                    is_backordered,
                    products(name, size, color, selling_price, factory_id)
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
            // Permanently deduct reserved stock (only for those that were NOT backordered)
            for (const item of order.sales_order_items) {
                if (!item.is_backordered) {
                    const factoryId = (item.products as any)?.factory_id || MAIN_FACTORY_ID;
                    await this.deliverStock(item.product_id, item.quantity, factoryId);
                }
            }
        } else if (status === 'cancelled') {
            // Return stock to inventory (only for those that were NOT backordered, as backordered items never left inventory)
            for (const item of order.sales_order_items) {
                if (!item.is_backordered) {
                    const factoryId = (item.products as any)?.factory_id || MAIN_FACTORY_ID;
                    await this.unreserveStock(item.product_id, item.quantity, item.unit_type, factoryId);
                } else {
                    // Cancel the production request if it exists
                    await supabase
                        .from('production_requests')
                        .update({ status: 'cancelled' })
                        .eq('sales_order_id', id)
                        .eq('product_id', item.product_id);
                }
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
                total_items: order.sales_order_items.reduce((sum: number, item: any) => sum + item.quantity, 0)
            }
        );

        return this.getOrderById(id);
    }

    async prepareOrderItem(itemId: string, userId: string) {
        // 1. Mark item as prepared
        const { data: item, error: itemError } = await supabase
            .from('sales_order_items')
            .update({
                is_prepared: true,
                prepared_at: new Date().toISOString(),
                prepared_by: userId
            })
            .eq('id', itemId)
            .select('*, products(name, factory_id), sales_orders(id, created_by)')
            .single();

        if (itemError) throw new Error(itemError.message);

        // 2. Check if the entire order is now prepared
        const orderId = (item.sales_orders as any).id;
        const { data: allItems } = await supabase
            .from('sales_order_items')
            .select('is_prepared')
            .eq('order_id', orderId);

        if (allItems && allItems.every(i => i.is_prepared)) {
            // Update order status to reserved (ready for delivery)
            await supabase
                .from('sales_orders')
                .update({ status: 'reserved' })
                .eq('id', orderId);

            // Notify the Sales Admin that the order is fully prepared
            const createdBy = (item.sales_orders as any)?.created_by;
            if (createdBy) {
                await supabase.from('notifications').insert({
                    user_id: createdBy,
                    title: 'Order Fully Prepared',
                    message: `All items for Order #${orderId.slice(-6).toUpperCase()} have been prepared. It is now ready for delivery.`,
                    type: 'order_prepared',
                    metadata: { order_id: orderId }
                });
            }
        } else {
            // Notify the Sales Admin about the single item being prepared (existing logic)
            const createdBy = (item.sales_orders as any)?.created_by;
            if (createdBy) {
                const productName = (item.products as any)?.name;
                await supabase.from('notifications').insert({
                    user_id: createdBy,
                    title: 'Item Prepared',
                    message: `Product "${productName}" for Order #${orderId.slice(-6).toUpperCase()} is ready at the factory.`,
                    type: 'item_prepared',
                    metadata: { order_id: orderId, item_id: itemId }
                });
            }
        }

        return item;
    }

    async processDelivery(orderId: string, deliveryData: {
        items: Array<{ item_id: string; unit_price: number }>;
        discount_type?: 'percentage' | 'fixed';
        discount_value?: number;
        payment_mode: 'cash' | 'credit';
        credit_deadline?: string;
        initial_payment?: number;
        payment_method?: string;
        notes?: string;
        user_id: string;
    }) {
        // 1. Fetch the order
        const order = await this.getOrderById(orderId);

        if (order.status !== 'reserved') {
            throw new Error('Only reserved orders can be delivered');
        }

        // 2. Update item prices
        let subtotal = 0;
        for (const itemData of deliveryData.items) {
            const { error } = await supabase
                .from('sales_order_items')
                .update({ unit_price: itemData.unit_price })
                .eq('id', itemData.item_id);

            if (error) throw new Error(`Failed to update item price: ${error.message}`);

            // Calculate subtotal
            const item = order.sales_order_items.find((i: any) => i.id === itemData.item_id);
            if (item) {
                subtotal += itemData.unit_price * item.quantity;
            }
        }

        // 3. Calculate discount and total
        let discountAmount = 0;
        if (deliveryData.discount_type && deliveryData.discount_value) {
            if (deliveryData.discount_type === 'percentage') {
                discountAmount = (subtotal * deliveryData.discount_value) / 100;
            } else {
                discountAmount = deliveryData.discount_value;
            }
        }

        const totalAmount = subtotal - discountAmount;
        const initialPayment = deliveryData.initial_payment || 0;
        const balanceDue = totalAmount - initialPayment;

        // 4. Update sales order with payment details
        const { error: orderError } = await supabase
            .from('sales_orders')
            .update({
                subtotal,
                discount_type: deliveryData.discount_type || null,
                discount_value: deliveryData.discount_value || null,
                total_amount: totalAmount,
                payment_mode: deliveryData.payment_mode,
                credit_deadline: deliveryData.credit_deadline || null,
                amount_paid: initialPayment,
                balance_due: balanceDue,
                status: 'delivered',
                delivered_at: new Date().toISOString(),
                notes: deliveryData.notes || order.notes
            })
            .eq('id', orderId);

        if (orderError) throw new Error(`Failed to update order: ${orderError.message}`);

        // 5. Create initial payment record if amount > 0
        if (initialPayment > 0) {
            const { error: paymentError } = await supabase
                .from('payments')
                .insert({
                    sales_order_id: orderId,
                    customer_id: order.customer_id,
                    amount: initialPayment,
                    payment_method: deliveryData.payment_method || 'Cash',
                    notes: 'Initial payment at delivery',
                    recorded_by: deliveryData.user_id
                });

            if (paymentError) throw new Error(`Failed to record payment: ${paymentError.message}`);

            // Log to Cash Flow
            const categoryId = await cashFlowService.getCategoryId('Cash Sales', 'income');
            await cashFlowService.logEntry({
                category_id: categoryId,
                amount: initialPayment,
                payment_mode: deliveryData.payment_method || 'Cash',
                reference_id: orderId,
                notes: `Initial payment at delivery for Order #${orderId.slice(-6).toUpperCase()}`,
                is_automatic: true
            });
        }

        // 6. Deliver stock (move from reserved to delivered)
        for (const item of order.sales_order_items) {
            const factoryId = (item.products as any)?.factory_id || MAIN_FACTORY_ID;
            await this.deliverStock(item.product_id, item.quantity, factoryId);
        }

        // 7. Audit logging
        await auditService.logAction(
            deliveryData.user_id,
            'process_delivery',
            'sales_orders',
            orderId,
            {
                subtotal,
                discount: discountAmount,
                total_amount: totalAmount,
                payment_mode: deliveryData.payment_mode,
                initial_payment: initialPayment,
                balance_due: balanceDue
            }
        );

        return this.getOrderById(orderId);
    }

    async recordPayment(orderId: string, paymentData: {
        amount: number;
        payment_method: string;
        notes?: string;
        user_id: string;
    }) {
        // 1. Fetch the order
        const order = await this.getOrderById(orderId);

        if (order.status !== 'delivered') {
            throw new Error('Can only record payments for delivered orders');
        }

        if (!order.balance_due || order.balance_due <= 0) {
            throw new Error('This order has no pending balance');
        }

        if (paymentData.amount > order.balance_due) {
            throw new Error(`Payment amount (${paymentData.amount}) exceeds balance due (${order.balance_due})`);
        }

        // 2. Create payment record
        const { error: paymentError } = await supabase
            .from('payments')
            .insert({
                sales_order_id: orderId,
                customer_id: order.customer_id,
                amount: paymentData.amount,
                payment_method: paymentData.payment_method,
                notes: paymentData.notes,
                recorded_by: paymentData.user_id
            });

        if (paymentError) throw new Error(`Failed to record payment: ${paymentError.message}`);

        // Log to Cash Flow
        const categoryId = await cashFlowService.getCategoryId('Cash Sales', 'income');
        await cashFlowService.logEntry({
            category_id: categoryId,
            amount: paymentData.amount,
            payment_mode: paymentData.payment_method,
            reference_id: orderId,
            notes: `Payment for Order #${orderId.slice(-6).toUpperCase()}: ${paymentData.notes || 'No notes'}`,
            is_automatic: true
        });

        // 3. Update order balance
        const newAmountPaid = (order.amount_paid || 0) + paymentData.amount;
        const newBalanceDue = order.balance_due - paymentData.amount;

        const { error: updateError } = await supabase
            .from('sales_orders')
            .update({
                amount_paid: newAmountPaid,
                balance_due: newBalanceDue,
                is_overdue: false // Clear overdue flag when payment is made
            })
            .eq('id', orderId);

        if (updateError) throw new Error(`Failed to update order balance: ${updateError.message}`);

        // 4. Audit logging
        await auditService.logAction(
            paymentData.user_id,
            'record_payment',
            'sales_orders',
            orderId,
            {
                amount: paymentData.amount,
                payment_method: paymentData.payment_method,
                new_balance: newBalanceDue
            }
        );

        // 5. Notify if balance is cleared
        if (newBalanceDue === 0) {
            await supabase.from('notifications').insert({
                user_id: order.created_by,
                title: 'Payment Completed',
                message: `Order #${orderId.slice(-6).toUpperCase()} has been fully paid.`,
                type: 'payment_completed',
                metadata: { order_id: orderId }
            });
        }

        return this.getOrderById(orderId);
    }

    async getCustomerPaymentHistory(customerId: string) {
        // Fetch all orders for the customer with payment details
        const { data: orders, error } = await supabase
            .from('sales_orders')
            .select(`
                *,
                sales_order_items(*, products(name)),
                payments(*)
            `)
            .eq('customer_id', customerId)
            .eq('status', 'delivered')
            .order('delivered_at', { ascending: false });

        if (error) throw new Error(error.message);

        // Calculate totals
        const totalBilled = orders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
        const totalPaid = orders?.reduce((sum, order) => sum + (order.amount_paid || 0), 0) || 0;
        const outstandingBalance = orders?.reduce((sum, order) => sum + (order.balance_due || 0), 0) || 0;

        return {
            customer_id: customerId,
            total_orders: orders?.length || 0,
            total_billed: totalBilled,
            total_paid: totalPaid,
            outstanding_balance: outstandingBalance,
            orders: orders || []
        };
    }

    async getPendingPayments(filters?: {
        customer_id?: string;
        is_overdue?: boolean;
    }) {
        let query = supabase
            .from('sales_orders')
            .select(`
                *,
                customers(name, phone, email),
                sales_order_items(*, products(name))
            `)
            .eq('status', 'delivered')
            .gt('balance_due', 0)
            .order('credit_deadline', { ascending: true, nullsFirst: false });

        if (filters?.customer_id) {
            query = query.eq('customer_id', filters.customer_id);
        }

        if (filters?.is_overdue) {
            query = query.eq('is_overdue', true);
        }

        const { data, error } = await query;

        if (error) throw new Error(error.message);

        return data || [];
    }

    async deleteOrder(id: string) {

        // Can only delete cancelled orders or reserved orders
        const order = await this.getOrderById(id);

        if (order.status === 'delivered') {
            throw new Error('Cannot delete delivered orders');
        }

        if (order.status === 'reserved') {
            // Unreserve stock first (only for non-backordered)
            for (const item of order.sales_order_items) {
                if (!item.is_backordered) {
                    const factoryId = (item.products as any)?.factory_id || MAIN_FACTORY_ID;
                    await this.unreserveStock(item.product_id, item.quantity, item.unit_type, factoryId);
                }
            }
        }

        const { error } = await supabase
            .from('sales_orders')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { message: 'Order deleted successfully' };
    }

    /**
     * Check and update overdue orders
     * Marks orders as overdue if credit_deadline has passed and balance_due > 0
     * @returns Number of orders marked as overdue
     */
    async checkAndUpdateOverdueOrders(): Promise<{ count: number; orders: any[] }> {
        const today = new Date().toISOString().split('T')[0];

        // Find orders that should be marked as overdue
        const { data: overdueOrders, error: selectError } = await supabase
            .from('sales_orders')
            .select('id, customer_id, balance_due, credit_deadline')
            .eq('payment_mode', 'credit')
            .gt('balance_due', 0)
            .lt('credit_deadline', today)
            .eq('is_overdue', false);

        if (selectError) throw new Error(selectError.message);

        if (!overdueOrders || overdueOrders.length === 0) {
            return { count: 0, orders: [] };
        }

        // Update all overdue orders
        const orderIds = overdueOrders.map(o => o.id);
        const { error: updateError } = await supabase
            .from('sales_orders')
            .update({ is_overdue: true, updated_at: new Date().toISOString() })
            .in('id', orderIds);

        if (updateError) throw new Error(updateError.message);

        console.log(`[Overdue Check] Marked ${overdueOrders.length} orders as overdue`);

        return {
            count: overdueOrders.length,
            orders: overdueOrders
        };
    }
}

export const salesOrderService = new SalesOrderService();

