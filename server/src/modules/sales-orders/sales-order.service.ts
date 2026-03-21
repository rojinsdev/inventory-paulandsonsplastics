import { supabase } from '../../config/supabase';
import { AuditService } from '../audit/audit.service';
import { inventoryService } from '../inventory/inventory.service';
import { cashFlowService } from '../cash-flow/cash-flow.service';
import logger from '../../utils/logger';
import { getPagination } from '../../utils/supabase';
import { pushNotificationService } from '../notifications/push-notification.service';
import { AppError } from '../../utils/AppError';

const auditService = new AuditService();
const MAIN_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';

export interface CreateSalesOrderDTO {
    customer_id: string;
    delivery_date?: string; // Added: Delivery date requirement from user
    items: Array<{
        product_id: string;
        quantity: number;
        unit_type?: 'bundle' | 'packet' | 'loose'; // Default to bundle if not provided
        unit_price?: number; // Optional: Custom rate for this customer
    }>;
    notes?: string;
    user_id: string; // Added: Track which admin created the order
}

export interface UpdateOrderStatusDTO {
    status: 'reserved' | 'delivered' | 'cancelled' | 'pending';
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
                order_date: new Date().toISOString().split('T')[0] // Explicitly set order date
            })
            .select()
            .maybeSingle();

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
                    unit_price: item.unit_price ?? product?.selling_price ?? 0,
                    is_backordered: isBackordered
                });

            if (itemError) {
                logger.error('Failed to create sales order item', { error: itemError.message, orderId: order.id, item });
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
            const fid = p?.factory_id || MAIN_FACTORY_ID;
            factoryIds.add(fid);
        }

        for (const factoryId of factoryIds) {
            const { data: managers, error: managerError } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('role', 'production_manager')
                .eq('factory_id', factoryId);

            if (managerError) {
                logger.warn('Could not fetch production managers for factory', { factoryId, error: managerError.message });
            }

            if (managers) {
                for (const manager of managers) {
                    const { error: notificationError } = await supabase.from('notifications').insert({
                        user_id: manager.id,
                        title: 'New Sales Order Needs Preparation',
                        message: `Order #${order.id.slice(-6).toUpperCase()} has items from your factory. Delivery scheduled for ${data.delivery_date || 'ASAP'}.`,
                        type: 'sales_order_preparation',
                        metadata: { order_id: order.id }
                    });
                    if (notificationError) {
                        logger.error('Failed to send sales order preparation notification', { error: notificationError.message, managerId: manager.id, orderId: order.id });
                    }
                }

                // Push Notification to Factory Managers
                await pushNotificationService.sendToRole('production_manager', {
                    title: 'New Sales Order Received',
                    body: `Order #${order.id.slice(-6).toUpperCase()} requires items from your factory.`,
                    data: { order_id: order.id, type: 'sales_order' }
                }, factoryId);
            }
        }

        // Return full order with items
        const fullOrder = await this.getOrderById(order.id);

        // Audit logging for order creation
        try {
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
        } catch (auditError: any) {
            logger.error('Failed to create audit log for sales order creation', { error: auditError.message, userId: data.user_id, orderId: order.id });
            // Do not rethrow, audit logging should not block core functionality
        }

        logger.info('Sales order created successfully', { orderId: order.id, customerId: data.customer_id, userId: data.user_id });
        return fullOrder;
    }

    private async getAvailableStock(productId: string, unitType: string, factoryId: string): Promise<number> {
        const stateMapping: Record<string, string> = {
            'loose': 'semi_finished',
            'packet': 'packed',
            'bundle': 'finished'
        };

        const targetState = stateMapping[unitType] || 'finished';

        const { data: stock, error } = await supabase
            .from('stock_balances')
            .select('quantity, unit_type, factory_id')
            .eq('product_id', productId)
            .eq('state', targetState)
            .or(`factory_id.eq.${factoryId},factory_id.is.null`);

        if (error) {
            logger.error('Stock fetch error in getAvailableStock', { error: error.message, productId, unitType, factoryId });
            throw new Error(`Stock fetch error: ${error.message}`);
        }
        
        const total = stock?.reduce((sum, item) => {
            // If we're looking for a specific unit type, skip others
            if (item.unit_type && item.unit_type !== unitType) {
                return sum;
            }
            return sum + Number(item.quantity);
        }, 0) || 0;

        logger.info(`[Stock Check] Product: ${productId}, Unit: ${unitType}, State: ${targetState}, Factory: ${factoryId}, Total: ${total}`, {
            rowCount: stock?.length,
            rows: stock?.map(s => `Qty: ${s.quantity}, Unit: ${s.unit_type}, Fact: ${s.factory_id}`)
        });

        return total;
    }

    private async reserveStock(productId: string, quantity: number, unitType: string, factoryId: string) {
        const stateMapping: Record<string, string> = {
            'loose': 'semi_finished',
            'packet': 'packed',
            'bundle': 'finished'
        };
        const sourceState = stateMapping[unitType] || 'finished';

        // 1. Deduct from source state atomically
        const { error: deductError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factoryId,
            p_state: sourceState,
            p_quantity_change: -quantity,
            p_cap_id: null,
            p_unit_type: unitType
        });

        if (deductError) {
            logger.error('Failed to deduct stock during reservation', { error: deductError.message, productId, quantity, unitType, factoryId, sourceState });
            throw new Error(`Failed to deduct ${sourceState} stock: ${deductError.message}`);
        }

        // 2. Add to reserved state atomically
        const { error: reserveError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: factoryId,
            p_state: 'reserved',
            p_quantity_change: quantity,
            p_cap_id: null,
            p_unit_type: unitType
        });

        if (reserveError) {
            logger.error('Failed to update reserved stock during reservation', { error: reserveError.message, productId, quantity, unitType, factoryId });
            // ROLLING BACK the deduction if addition fails (though unlikely with simple increment)
            await supabase.rpc('adjust_stock', {
                p_product_id: productId,
                p_factory_id: factoryId,
                p_state: sourceState,
                p_quantity_change: quantity,
                p_cap_id: null,
                p_unit_type: unitType
            });
            throw new Error(`Failed to update reserved stock: ${reserveError.message}`);
        }

        // 3. Log Audit Trail
        try {
            await inventoryService.logTransaction('reserve', productId, quantity, unitType, sourceState, 'reserved', factoryId);
        } catch (auditError: any) {
            logger.error('Failed to log inventory transaction for stock reservation', { error: auditError.message, productId, quantity, factoryId });
        }
        logger.info('Stock reserved successfully', { productId, quantity, unitType, factoryId });
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

        if (reqError) {
            logger.error('Failed to create production request', { error: reqError.message, productId, factoryId, quantity, orderId });
            throw new Error(`Failed to create production request: ${reqError.message}`);
        }

        // 2. Notify Production Manager
        const { data: managers, error: managerError } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('role', 'production_manager')
            .eq('factory_id', factoryId);

        if (managerError) {
            logger.warn('Could not fetch production managers for factory during production request notification', { factoryId, error: managerError.message });
        }

        if (managers && managers.length > 0) {
            const { data: product, error: productError } = await supabase.from('products').select('name').eq('id', productId).single();
            if (productError) {
                logger.warn('Could not fetch product name for production request notification', { productId, error: productError.message });
            }
            for (const manager of managers) {
                const { error: notificationError } = await supabase.from('notifications').insert({
                    user_id: manager.id,
                    title: 'New Production Request',
                    message: `Demand Signal: ${quantity} units of ${product?.name || 'Unknown Product'} (${unitType}) needed for Order #${orderId.slice(-6).toUpperCase()}`,
                    type: 'production_request',
                    metadata: { request_id: request.id, order_id: orderId }
                });
                if (notificationError) {
                    logger.error('Failed to send production request notification', { error: notificationError.message, managerId: manager.id, requestId: request.id });
                }
            }

            // Push Notification for Production Request
            await pushNotificationService.sendToRole('production_manager', {
                title: 'New Production Request',
                body: `${quantity} units of ${product?.name || 'Product'} needed for Order #${orderId.slice(-6).toUpperCase()}`,
                data: { request_id: request.id, order_id: orderId, type: 'production_request' }
            }, factoryId);
        }
        logger.info('Production request created', { requestId: request.id, productId, quantity, orderId });
    }

    private async unreserveStock(productId: string, quantity: number, unitType: string, factoryId: string) {
        const stateMapping: Record<string, string> = {
            'loose': 'semi_finished',
            'packet': 'packed',
            'bundle': 'finished'
        };
        const targetState = stateMapping[unitType] || 'finished';

        // 1. Fetch ALL reserved stock records for this specific combination
        const { data: balances, error: fetchError } = await supabase
            .from('stock_balances')
            .select('quantity, cap_id')
            .eq('product_id', productId)
            .eq('state', 'reserved')
            .eq('factory_id', factoryId)
            .eq('unit_type', unitType);

        if (fetchError) {
            logger.error('Failed to fetch reserved stock for unreservation', { error: fetchError.message, productId, factoryId, unitType });
            throw new Error(`Failed to fetch reserved stock: ${fetchError.message}`);
        }

        const totalReserved = balances?.reduce((sum, b) => sum + Number(b.quantity), 0) || 0;
        if (totalReserved < quantity) {
            logger.warn('Attempted to unreserve more than available in reserved state', { productId, quantity, totalReserved });
            // We'll proceed with what we have, but log the warning
        }

        let remainingToUnreserve = Math.min(quantity, totalReserved);
        const sortedBalances = [...(balances || [])].sort((a, b) => Number(b.quantity) - Number(a.quantity));

        for (const balance of sortedBalances) {
            if (remainingToUnreserve <= 0) break;

            const moveAmount = Math.min(remainingToUnreserve, Number(balance.quantity));

            // Deduct from reserved
            const { error: deductError } = await supabase.rpc('adjust_stock', {
                p_product_id: productId,
                p_factory_id: factoryId,
                p_state: 'reserved',
                p_quantity_change: -moveAmount,
                p_cap_id: balance.cap_id,
                p_unit_type: unitType
            });
            if (deductError) throw new Error(`Failed to deduct reserved stock: ${deductError.message}`);

            // Add back to target state
            const { error: addBackError } = await supabase.rpc('adjust_stock', {
                p_product_id: productId,
                p_factory_id: factoryId,
                p_state: targetState,
                p_quantity_change: moveAmount,
                p_cap_id: balance.cap_id,
                p_unit_type: unitType
            });
            if (addBackError) throw new Error(`Failed to add back to target stock: ${addBackError.message}`);

            remainingToUnreserve -= moveAmount;
        }

        // 3. Log Audit Trail
        try {
            await inventoryService.logTransaction('unreserve', productId, quantity, unitType, 'reserved', targetState, factoryId);
        } catch (auditError: any) {
            logger.error('Failed to log inventory transaction for stock unreservation', { error: auditError.message, productId, quantity, factoryId });
        }
        logger.info('Stock unreserved successfully', { productId, quantity, unitType, factoryId });
    }

    private async deliverStock(productId: string, quantity: number, unitType: string, factoryId: string) {
        // Permanently remove from reserved (stock is sold)
        // 1. Fetch ALL reserved stock records
        const { data: balances, error: fetchError } = await supabase
            .from('stock_balances')
            .select('quantity, cap_id')
            .eq('product_id', productId)
            .eq('state', 'reserved')
            .eq('factory_id', factoryId)
            .eq('unit_type', unitType);

        if (fetchError) {
            logger.error('Failed to fetch reserved stock for delivery', { error: fetchError.message, productId, factoryId, unitType });
            throw new Error(`Failed to fetch reserved stock: ${fetchError.message}`);
        }

        const totalReserved = balances?.reduce((sum, b) => sum + Number(b.quantity), 0) || 0;
        if (totalReserved < quantity) {
            logger.warn('Attempted to deliver more than available in reserved state', { productId, quantity, totalReserved });
        }

        let remainingToDeliver = Math.min(quantity, totalReserved);
        const sortedBalances = [...(balances || [])].sort((a, b) => Number(b.quantity) - Number(a.quantity));

        for (const balance of sortedBalances) {
            if (remainingToDeliver <= 0) break;

            const deliverAmount = Math.min(remainingToDeliver, Number(balance.quantity));

            // Deduct from reserved atomically and permanently (since it's delivered)
            const { error: deductError } = await supabase.rpc('adjust_stock', {
                p_product_id: productId,
                p_factory_id: factoryId,
                p_state: 'reserved',
                p_quantity_change: -deliverAmount,
                p_cap_id: balance.cap_id,
                p_unit_type: unitType
            });
            if (deductError) throw new Error(`Failed to deduct reserved stock for delivery: ${deductError.message}`);

            remainingToDeliver -= deliverAmount;
        }

        // Log Audit Trail
        try {
            await inventoryService.logTransaction('delivery', productId, quantity, unitType, 'reserved', null, factoryId);
        } catch (auditError: any) {
            logger.error('Failed to log inventory transaction for stock delivery', { error: auditError.message, productId, quantity, factoryId });
        }
        logger.info('Stock delivered successfully', { productId, quantity, factoryId });
    }

    async getAllOrders(filters?: { status?: string; factoryId?: string; page?: number; size?: number }) {
        const { from, to } = getPagination(filters?.page, filters?.size);

        let query = supabase
            .from('sales_orders')
            .select(`
                *,
                customer:customers(name, phone, type),
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
            `, { count: 'exact' });

        if (filters?.status) {
            query = query.eq('status', filters.status);
        }

        if (filters?.factoryId) {
            query = query.eq('sales_order_items.products.factory_id', filters.factoryId);
        }

        const { data, error, count } = await query
            .order('order_date', { ascending: false })
            .range(from, to);

        if (error) {
            logger.error('Failed to fetch all sales orders', { error: error.message, filters });
            throw new Error(error.message);
        }
        return {
            orders: data,
            pagination: {
                total: count,
                page: filters?.page || 1,
                size: filters?.size || 10
            }
        };
    }

    async getOrderById(id: string) {
        const { data, error } = await supabase
            .from('sales_orders')
            .select(`
                *,
                customer:customers(name, phone, type),
                sales_order_items(
                    id,
                    product_id,
                    quantity,
                    unit_type,
                    is_backordered,
                    is_prepared,
                    products(name, size, color, selling_price, factory_id)
                )
            `)
            .eq('id', id)
            .maybeSingle();

        if (error) {
            logger.error('Failed to fetch sales order by ID', { error: error.message, orderId: id });
            throw new Error(error.message);
        }
        if (!data) {
            logger.warn('Sales order not found', { orderId: id });
            return null;
        }
        return data;
    }

    async updateOrder(id: string, data: CreateSalesOrderDTO) {
        // 1. Fetch current order with its items
        const order = await this.getOrderById(id);
        if (!order) {
            logger.warn('Attempted to update non-existent order', { orderId: id });
            throw new Error('Order not found');
        }

        // Only allow editing for pending/reserved orders
        if (order.status !== 'pending' && order.status !== 'reserved') {
            logger.warn('Attempted to edit order in restricted status', { orderId: id, status: order.status });
            throw new Error(`Cannot edit order in ${order.status} status`);
        }

        // 2. Rollback current inventory requirements
        // A. Unreserve stock for current items
        for (const item of order.sales_order_items) {
            const factoryId = (item.products as any)?.factory_id || MAIN_FACTORY_ID;
            
            // If it's NOT backordered, it means it's fully reserved.
            // If it IS backordered, it might be partially reserved if is_prepared is false but availableStock was > 0.
            // However, the current system doesn't track partial reservation quantity in sales_order_items.
            // For now, we follow the existing pattern: unreserve full quantity for non-backordered.
            if (!item.is_backordered) {
                await this.unreserveStock(item.product_id, item.quantity, item.unit_type, factoryId);
            } else if (item.is_prepared) {
                // If it was backordered but now prepared, it is effectively reserved.
                await this.unreserveStock(item.product_id, item.quantity, item.unit_type, factoryId);
            }
        }

        // B. Cancel/Delete pending production requests related to this order
        // This ensures the mobile app feed is cleared of stale requests.
        const { error: cancelReqError } = await supabase
            .from('production_requests')
            .delete()
            .eq('sales_order_id', id)
            .in('status', ['pending', 'in_production', 'ready']); // Cancel any that aren't 'completed'
        
        if (cancelReqError) {
            logger.error('Failed to clear stale production requests during order update', { error: cancelReqError.message, orderId: id });
            // Continue as this is not a fatal error for the order itself
        }

        // 3. Update Order core metadata
        const { error: updateOrderError } = await supabase
            .from('sales_orders')
            .update({
                customer_id: data.customer_id,
                delivery_date: data.delivery_date,
                notes: data.notes,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateOrderError) {
            logger.error('Failed to update sales order metadata', { error: updateOrderError.message, orderId: id });
            throw new Error(updateOrderError.message);
        }

        // 4. Reset Items: Delete existing items and re-insert new ones
        const { error: deleteItemsError } = await supabase
            .from('sales_order_items')
            .delete()
            .eq('order_id', id);

        if (deleteItemsError) {
            logger.error('Failed to delete old sales order items during update', { error: deleteItemsError.message, orderId: id });
            throw new Error(`Failed to reset order items: ${deleteItemsError.message}`);
        }

        // 5. Re-apply Reservation and Production Request Logic for NEW items
        for (const item of data.items) {
            const unit_type = item.unit_type || 'bundle';

            // Fetch current product info
            const { data: product } = await supabase
                .from('products')
                .select('selling_price, factory_id')
                .eq('id', item.product_id)
                .single();

            const factoryId = product?.factory_id || MAIN_FACTORY_ID;
            const availableStock = await this.getAvailableStock(item.product_id, unit_type, factoryId);
            const isBackordered = availableStock < item.quantity;

            // Insert new item
            const { error: itemError } = await supabase
                .from('sales_order_items')
                .insert({
                    order_id: id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_type: unit_type,
                    unit_price: item.unit_price ?? product?.selling_price ?? 0,
                    is_backordered: isBackordered
                });

            if (itemError) {
                logger.error('Failed to insert new item during order update', { error: itemError.message, orderId: id, item });
                throw new Error(`Failed to update order item: ${itemError.message}`);
            }

            // Handle stock reservation or production request
            if (!isBackordered) {
                await this.reserveStock(item.product_id, item.quantity, unit_type, factoryId);
            } else {
                const needed = item.quantity - availableStock;
                await this.createProductionRequest(item.product_id, factoryId, needed, unit_type, id);
                
                if (availableStock > 0) {
                    await this.reserveStock(item.product_id, availableStock, unit_type, factoryId);
                }
            }
        }

        // 6. Audit Logging
        try {
            await auditService.logAction(
                data.user_id,
                'update_sales_order',
                'sales_orders',
                id,
                {
                    old_order_items: order.sales_order_items.map((i: any) => ({ product_id: i.product_id, quantity: i.quantity })),
                    new_order_items: data.items,
                    customer_id: data.customer_id
                }
            );
        } catch (auditError: any) {
            logger.error('Failed to log audit action for sales order update', { error: auditError.message, orderId: id });
        }

        logger.info('Sales order updated successfully', { orderId: id, userId: data.user_id });
        return this.getOrderById(id);
    }

    async updateOrderStatus(id: string, status: 'reserved' | 'delivered' | 'cancelled' | 'pending', userId: string) {
        const order = await this.getOrderById(id);

        if (!order) {
            logger.warn('Attempted to update status of non-existent order', { orderId: id, status, userId });
            throw new Error('Order not found');
        }

        if (status === 'delivered' && order.status !== 'reserved') {
            logger.warn('Attempted to deliver an order not in reserved status', { orderId: id, currentStatus: order.status, userId });
            throw new Error('Can only deliver orders that are reserved');
        }

        if (status === 'cancelled' && order.status === 'delivered') {
            logger.warn('Attempted to cancel a delivered order', { orderId: id, userId });
            throw new Error('Cannot cancel delivered orders');
        }

        // Handle stock movements
        if (status === 'delivered') {
            // Permanently deduct reserved stock (only for those that were NOT backordered)
            for (const item of order.sales_order_items) {
                if (!item.is_backordered) {
                    const factoryId = (item.products as any)?.factory_id || MAIN_FACTORY_ID;
                    await this.deliverStock(item.product_id, item.quantity, item.unit_type, factoryId);
                }
            }
            logger.info('Order delivered, stock deducted', { orderId: id, userId });
        } else if (status === 'cancelled') {
            // Return stock to inventory (only for those that were NOT backordered, as backordered items never left inventory)
            for (const item of order.sales_order_items) {
                if (!item.is_backordered) {
                    const factoryId = (item.products as any)?.factory_id || MAIN_FACTORY_ID;
                    await this.unreserveStock(item.product_id, item.quantity, item.unit_type, factoryId);
                } else {
                    // Cancel the production request if it exists
                    const { error: cancelReqError } = await supabase
                        .from('production_requests')
                        .update({ status: 'cancelled' })
                        .eq('sales_order_id', id)
                        .eq('product_id', item.product_id);
                    if (cancelReqError) {
                        logger.error('Failed to cancel production request for cancelled order item', { error: cancelReqError.message, orderId: id, productId: item.product_id });
                    }
                }
            }
            logger.info('Order cancelled, stock unreserved and production requests cancelled', { orderId: id, userId });
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

        if (error) {
            logger.error('Failed to update sales order status', { error: error.message, orderId: id, newStatus: status, userId });
            throw new Error(error.message);
        }

        // Audit logging for status change
        try {
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
        } catch (auditError: any) {
            logger.error('Failed to create audit log for sales order status update', { error: auditError.message, userId, orderId: id, newStatus: status });
        }

        logger.info('Sales order status updated', { orderId: id, newStatus: status, userId });
        return this.getOrderById(id);
    }

    async prepareOrderItem(itemId: string, userId: string) {
        // 0. Fetch item first to check backorder status
        const { data: currentItem, error: fetchError } = await supabase
            .from('sales_order_items')
            .select('is_backordered, order_id')
            .eq('id', itemId)
            .single();

        if (fetchError || !currentItem) {
            logger.error('Failed to fetch sales order item for preparation check', { error: fetchError?.message, itemId });
            throw new AppError('Order item not found', 404);
        }

        if (currentItem.is_backordered) {
            logger.warn('Attempted to prepare a backordered item', { itemId, orderId: currentItem.order_id, userId });
            throw new AppError('Cannot prepare item with pending backorder. Please fulfill the production request first.', 400);
        }

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

        if (itemError) {
            logger.error('Failed to prepare sales order item', { error: itemError.message, itemId, userId });
            throw new Error(itemError.message);
        }

        // 2. Check if the entire order is now prepared
        const orderId = (item.sales_orders as any).id;
        const { data: allItems, error: allItemsError } = await supabase
            .from('sales_order_items')
            .select('is_prepared')
            .eq('order_id', orderId);

        if (allItemsError) {
            logger.error('Failed to fetch all items for order after item preparation', { error: allItemsError.message, orderId });
            // Continue without full order status update if this fails
        }

        if (allItems && allItems.every(i => i.is_prepared)) {
            // Update order status to reserved (ready for delivery)
            const { error: updateOrderError } = await supabase
                .from('sales_orders')
                .update({ status: 'reserved' })
                .eq('id', orderId);

            if (updateOrderError) {
                logger.error('Failed to update order status to reserved after all items prepared', { error: updateOrderError.message, orderId });
            } else {
                logger.info('Order fully prepared and status set to reserved', { orderId });
            }

            // Notify the Sales Admin that the order is fully prepared
            const createdBy = (item.sales_orders as any)?.created_by;
            if (createdBy) {
                const { error: notificationError } = await supabase.from('notifications').insert({
                    user_id: createdBy,
                    title: 'Order Fully Prepared',
                    message: `All items for Order #${orderId.slice(-6).toUpperCase()} have been prepared. It is now ready for delivery.`,
                    type: 'order_prepared',
                    metadata: { order_id: orderId }
                });
                if (notificationError) {
                    logger.error('Failed to send order fully prepared notification', { error: notificationError.message, createdBy, orderId });
                }

                // Push Notification for Sales Admin
                await pushNotificationService.sendToUsers([createdBy], {
                    title: 'Order Fully Prepared',
                    body: `Order #${orderId.slice(-6).toUpperCase()} is now ready for delivery.`,
                    data: { order_id: orderId, type: 'order_prepared' }
                });
            }
        } else {
            // Notify the Sales Admin about the single item being prepared (existing logic)
            const createdBy = (item.sales_orders as any)?.created_by;
            if (createdBy) {
                const productName = (item.products as any)?.name;
                const { error: notificationError } = await supabase.from('notifications').insert({
                    user_id: createdBy,
                    title: 'Item Prepared',
                    message: `Product "${productName}" for Order #${orderId.slice(-6).toUpperCase()} is ready at the factory.`,
                    type: 'item_prepared',
                    metadata: { order_id: orderId, item_id: itemId }
                });
                if (notificationError) {
                    logger.error('Failed to send item prepared notification', { error: notificationError.message, createdBy, orderId, itemId });
                }
            }
        }
        logger.info('Sales order item prepared', { itemId, orderId, userId });
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

        if (!order) {
            logger.warn('Attempted to process delivery for non-existent order', { orderId, deliveryData });
            throw new Error('Order not found');
        }

        if (order.status !== 'reserved') {
            logger.warn('Attempted to deliver an order not in reserved status', { orderId, currentStatus: order.status, deliveryData });
            throw new Error('Only reserved orders can be delivered');
        }

        // 2. Update item prices
        let subtotal = 0;
        for (const itemData of deliveryData.items) {
            const { error } = await supabase
                .from('sales_order_items')
                .update({ unit_price: itemData.unit_price })
                .eq('id', itemData.item_id);

            if (error) {
                logger.error('Failed to update item price during delivery processing', { error: error.message, orderId, itemId: itemData.item_id, unitPrice: itemData.unit_price });
                throw new Error(`Failed to update item price: ${error.message}`);
            }

            // Calculate subtotal
            const item = order.sales_order_items.find((i: any) => i.id === itemData.item_id);
            if (item) {
                subtotal += itemData.unit_price * item.quantity;
            } else {
                logger.warn('Item not found in order during subtotal calculation for delivery', { orderId, itemId: itemData.item_id });
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

        if (orderError) {
            logger.error('Failed to update sales order details during delivery processing', { error: orderError.message, orderId, deliveryData });
            throw new Error(`Failed to update order: ${orderError.message}`);
        }

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

            if (paymentError) {
                logger.error('Failed to record initial payment during delivery processing', { error: paymentError.message, orderId, initialPayment, userId: deliveryData.user_id });
                throw new Error(`Failed to record payment: ${paymentError.message}`);
            }

            // Log to Cash Flow
            try {
                const categoryId = await cashFlowService.getCategoryId('Cash Sales', 'income');
                await cashFlowService.logEntry({
                    category_id: categoryId,
                    amount: initialPayment,
                    payment_mode: deliveryData.payment_method || 'Cash',
                    reference_id: orderId,
                    notes: `Initial payment at delivery for Order #${orderId.slice(-6).toUpperCase()}`,
                    is_automatic: true
                });
            } catch (cashFlowError: any) {
                logger.error('Failed to log initial payment to cash flow', { error: cashFlowError.message, orderId, initialPayment });
            }
        }

        // 6. Deliver stock (move from reserved to delivered)
        for (const item of order.sales_order_items) {
            const factoryId = (item.products as any)?.factory_id || MAIN_FACTORY_ID;
            await this.deliverStock(item.product_id, item.quantity, item.unit_type, factoryId);
        }

        // 7. Audit logging
        try {
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
        } catch (auditError: any) {
            logger.error('Failed to create audit log for delivery processing', { error: auditError.message, userId: deliveryData.user_id, orderId });
        }

        logger.info('Delivery processed successfully', { orderId, totalAmount, initialPayment, balanceDue, userId: deliveryData.user_id });
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

        if (!order) {
            logger.warn('Attempted to record payment for non-existent order', { orderId, paymentData });
            throw new Error('Order not found');
        }

        if (order.status !== 'delivered') {
            logger.warn('Attempted to record payment for an order not in delivered status', { orderId, currentStatus: order.status, paymentData });
            throw new Error('Can only record payments for delivered orders');
        }

        if (!order.balance_due || order.balance_due <= 0) {
            logger.warn('Attempted to record payment for an order with no pending balance', { orderId, balanceDue: order.balance_due, paymentData });
            throw new Error('This order has no pending balance');
        }

        if (paymentData.amount > order.balance_due) {
            logger.warn('Payment amount exceeds balance due', { orderId, paymentAmount: paymentData.amount, balanceDue: order.balance_due, paymentData });
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

        if (paymentError) {
            logger.error('Failed to record payment', { error: paymentError.message, orderId, paymentData });
            throw new Error(`Failed to record payment: ${paymentError.message}`);
        }

        // Log to Cash Flow
        try {
            const categoryId = await cashFlowService.getCategoryId('Cash Sales', 'income');
            await cashFlowService.logEntry({
                category_id: categoryId,
                amount: paymentData.amount,
                payment_mode: paymentData.payment_method,
                reference_id: orderId,
                notes: `Payment for Order #${orderId.slice(-6).toUpperCase()}: ${paymentData.notes || 'No notes'}`,
                is_automatic: true
            });
        } catch (cashFlowError: any) {
            logger.error('Failed to log payment to cash flow', { error: cashFlowError.message, orderId, paymentAmount: paymentData.amount });
        }

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

        if (updateError) {
            logger.error('Failed to update order balance after payment', { error: updateError.message, orderId, newBalanceDue });
            throw new Error(`Failed to update order balance: ${updateError.message}`);
        }

        // 4. Audit logging
        try {
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
        } catch (auditError: any) {
            logger.error('Failed to create audit log for payment recording', { error: auditError.message, userId: paymentData.user_id, orderId });
        }

        // 5. Notify if balance is cleared
        if (newBalanceDue === 0) {
            const { error: notificationError } = await supabase.from('notifications').insert({
                user_id: order.created_by,
                title: 'Payment Completed',
                message: `Order #${orderId.slice(-6).toUpperCase()} has been fully paid.`,
                type: 'payment_completed',
                metadata: { order_id: orderId }
            });
            if (notificationError) {
                logger.error('Failed to send payment completed notification', { error: notificationError.message, userId: order.created_by, orderId });
            }
        }
        logger.info('Payment recorded successfully', { orderId, amount: paymentData.amount, newBalanceDue, userId: paymentData.user_id });
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

        if (error) {
            logger.error('Failed to fetch customer payment history', { error: error.message, customerId });
            throw new Error(error.message);
        }

        // Calculate totals
        const totalBilled = orders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
        const totalPaid = orders?.reduce((sum, order) => sum + (order.amount_paid || 0), 0) || 0;
        const outstandingBalance = orders?.reduce((sum, order) => sum + (order.balance_due || 0), 0) || 0;

        // Derive payment_records and orders_with_balance for frontend
        const paymentRecords = (orders as any[])?.flatMap((o: any) => (o.payments || []).map((p: any) => ({
            ...p,
            order_number: `#${o.id.slice(-6).toUpperCase()}`
        }))) || [];

        const ordersWithBalance = (orders as any[])?.filter((o: any) => (o.balance_due || 0) > 0).map((o: any) => ({
            ...o,
            order_number: `#${o.id.slice(-6).toUpperCase()}`
        })) || [];

        logger.info('Customer payment history fetched', { customerId, totalOrders: orders?.length, outstandingBalance });
        return {
            customer_id: customerId,
            total_orders: orders?.length || 0,
            total_billed: totalBilled,
            total_paid: totalPaid,
            outstanding_balance: outstandingBalance,
            orders: orders || [],
            orders_with_balance: ordersWithBalance,
            payment_records: paymentRecords.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
        };
    }

    async getPendingPayments(filters?: {
        customer_id?: string;
        is_overdue?: boolean;
        status?: string;
        factoryId?: string;
    }) {
        let query = supabase
            .from('sales_orders')
            .select(`
                *,
                customer:customers(name, phone, email),
                sales_order_items(*, products(name)),
                payments(*)
            `)
            .eq('status', 'delivered')
            .order('credit_deadline', { ascending: true, nullsFirst: false });

        if (filters?.customer_id) {
            query = query.eq('customer_id', filters.customer_id);
        }

        if (filters?.factoryId) {
            query = query.filter('sales_order_items.products.factory_id', 'eq', filters.factoryId);
        }

        if (filters?.status === 'overdue' || filters?.is_overdue) {
            query = query.eq('is_overdue', true);
        } else if (filters?.status === 'pending') {
            // Include NULL balances as pending (or we could assume balance_due is not yet set)
            query = query.or('balance_due.gt.0,balance_due.is.null');
        } else if (filters?.status === 'paid') {
            query = query.eq('balance_due', 0);
        } else if (!filters?.status || filters.status === 'all') {
            // No additional filter on balance_due for 'all'
        } else {
            // Default to pending if not specified or unknown
            query = query.gt('balance_due', 0);
        }

        const { data, error } = await query;

        if (error) {
            logger.error('Failed to fetch pending payments', { error: error.message, filters });
            throw new Error(error.message);
        }
        logger.info('Pending payments fetched', { filters, count: data?.length || 0 });
        return data || [];
    }

    async deleteOrder(id: string) {

        // Can only delete cancelled orders or reserved orders
        const order = await this.getOrderById(id);

        if (!order) {
            logger.warn('Attempted to delete non-existent order', { orderId: id });
            throw new Error('Order not found');
        }

        if (order.status === 'delivered') {
            logger.warn('Attempted to delete a delivered order', { orderId: id });
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
            logger.info('Stock unreserved for deleted reserved order', { orderId: id });
        }

        const { error } = await supabase
            .from('sales_orders')
            .delete()
            .eq('id', id);

        if (error) {
            logger.error('Failed to delete sales order', { error: error.message, orderId: id });
            throw new Error(error.message);
        }
        logger.info('Sales order deleted successfully', { orderId: id });
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
            .select('id, customer_id, balance_due, credit_deadline, created_by')
            .eq('payment_mode', 'credit')
            .gt('balance_due', 0)
            .lt('credit_deadline', today)
            .eq('is_overdue', false);

        if (selectError) {
            logger.error('Failed to select overdue orders', { error: selectError.message });
            throw new Error(selectError.message);
        }

        if (!overdueOrders || overdueOrders.length === 0) {
            logger.info('[Overdue Check] No new overdue orders found.');
            return { count: 0, orders: [] };
        }

        // Update all overdue orders
        const orderIds = overdueOrders.map(o => o.id);
        const { error: updateError } = await supabase
            .from('sales_orders')
            .update({ is_overdue: true, updated_at: new Date().toISOString() })
            .in('id', orderIds);

        if (updateError) {
            logger.error('Failed to update orders as overdue', { error: updateError.message, orderIds });
            throw new Error(updateError.message);
        }

        // Create notifications for each overdue order
        const notifications = overdueOrders.map(order => ({
            user_id: order.created_by, // Notify the creator
            title: 'Overdue Payment Alert',
            message: `Order #${order.id.slice(-6).toUpperCase()} is overdue. Balance: ₹${order.balance_due}. Deadline was ${order.credit_deadline}.`,
            type: 'overdue_payment',
            metadata: { order_id: order.id, customer_id: order.customer_id }
        }));

        const { error: notifyError } = await supabase
            .from('notifications')
            .insert(notifications);

        if (notifyError) {
            logger.error('[Overdue Check] Failed to create notifications', { error: notifyError.message });
            // Don't throw here to avoid failing the script if only notifications fail
        }
        logger.info(`[Overdue Check] Marked ${overdueOrders.length} orders as overdue and sent notifications`);

        return {
            count: overdueOrders.length,
            orders: overdueOrders
        };
    }
}

export const salesOrderService = new SalesOrderService();

