import { supabase } from '../../config/supabase';
import { getIsoLocalDate } from '../../utils/dateUtils';
import { AuditService } from '../audit/audit.service';
import { inventoryService } from '../inventory/inventory.service';
import { cashFlowService } from '../cash-flow/cash-flow.service';
import logger from '../../utils/logger';
import { getPagination } from '../../utils/supabase';
import { AppError } from '../../utils/AppError';
import { eventBus } from '../../core/eventBus';
import { SystemEvents } from '../../core/events';

const MAIN_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';

export interface CreateSalesOrderDTO {
    customer_id: string;
    delivery_date?: string; // Added: Delivery date requirement from user
    items: Array<{
        product_id?: string;
        cap_id?: string;
        quantity: number;
        unit_type?: 'bundle' | 'packet' | 'loose' | 'bag' | 'box'; // Default to bundle if not provided
        unit_price?: number; // Optional: Custom rate for this customer
        include_inner?: boolean;
    }>;
    notes?: string;
    user_id: string; // Added: Track which admin created the order
}

export interface UpdateOrderStatusDTO {
    status: 'reserved' | 'delivered' | 'cancelled' | 'pending' | 'partially_delivered';
    user_id: string; // Added: Track which admin updated the status
}

export class SalesOrderService {
    async createOrder(data: CreateSalesOrderDTO) {
        logger.info('Creating sales order atomically:', { customerId: data.customer_id, itemCount: data.items.length, userId: data.user_id });

        // 1. Core Logic: Call atomic RPG for order and items creation
        const { data: result, error: rpcError } = await supabase.rpc('create_order_atomic', {
            p_customer_id: data.customer_id,
            p_delivery_date: data.delivery_date || null,
            p_notes: data.notes || '',
            p_user_id: data.user_id,
            p_items: data.items,
            p_order_date: getIsoLocalDate()
        });

        if (rpcError) {
            logger.error('create_order_atomic failed:', rpcError);
            throw new Error(`Failed to create order: ${rpcError.message}`);
        }

        const orderId = result.order_id;
        logger.info('Sales order created atomically', { orderId });

        // 3. Demand Signaling: Create production requests for backordered items
        // Fetch newly created backordered items for this order
        const { data: backorderedItems, error: fetchError } = await supabase
            .from('sales_order_items')
            .select('product_id, cap_id, quantity, unit_type, inner_id, include_inner, order_id')
            .eq('order_id', orderId)
            .eq('is_backordered', true);

        if (!fetchError && backorderedItems) {
            for (const item of backorderedItems) {
                // Determine factory_id (can be cached if needed, for now we follow existing service pattern)
                let factoryId = MAIN_FACTORY_ID;
                if (item.product_id) {
                    const { data: prod } = await supabase.from('products').select('factory_id').eq('id', item.product_id).single();
                    factoryId = prod?.factory_id || MAIN_FACTORY_ID;
                } else if (item.cap_id) {
                    const { data: cap } = await supabase.from('caps').select('factory_id').eq('id', item.cap_id).single();
                    factoryId = cap?.factory_id || MAIN_FACTORY_ID;
                }

                await this.createProductionRequest(
                    item.product_id, 
                    factoryId, 
                    item.quantity, 
                    item.unit_type, 
                    orderId, 
                    item.cap_id || undefined, 
                    item.inner_id || undefined
                );
            }
        }

        // 4. Side Effects: Emit Event
        // Side effects (Notifications, Audit, Finance) are now handled by event listeners
        eventBus.emit(SystemEvents.SALES_ORDER_CREATED, {
            order_id: orderId,
            customer_id: data.customer_id,
            userId: data.user_id,
            total_amount: result.total_amount || 0, // Could be enriched if needed
            items: data.items,
            delivery_date: data.delivery_date
        });

        // Return full order for the UI
        return this.getOrderById(orderId);
    }

    private async getAvailableStock(productId: string | null, unitType: string, factoryId: string, capId?: string): Promise<number> {
        const stateMapping: Record<string, string> = {
            'loose': 'semi_finished',
            'packet': 'packed',
            'bundle': 'finished'
        };

        const targetState = stateMapping[unitType] || 'finished';

        let query;
        if (capId) {
            query = supabase
                .from('cap_stock_balances')
                .select('quantity, unit_type, factory_id')
                .eq('cap_id', capId)
                .eq('state', targetState)
                .or(`factory_id.eq.${factoryId},factory_id.is.null`);
        } else {
            query = supabase
                .from('stock_balances')
                .select('quantity, unit_type, factory_id')
                .eq('product_id', productId)
                .eq('state', targetState)
                .or(`factory_id.eq.${factoryId},factory_id.is.null`);
        }

        const { data: stock, error } = await query;

        if (error) {
            logger.error('Stock fetch error in getAvailableStock', { error: error.message, productId, capId, unitType, factoryId });
            throw new Error(`Stock fetch error: ${error.message}`);
        }
        
        const total = stock?.reduce((sum, item: any) => {
            // If we're looking for a specific unit type, skip others
            if (item.unit_type && item.unit_type !== unitType && !capId) {
                return sum;
            }
            return sum + Number(item.quantity);
        }, 0) || 0;

        logger.info(`[Stock Check] ${capId ? 'Cap' : 'Product'}: ${capId || productId}, Unit: ${unitType}, State: ${targetState}, Factory: ${factoryId}, Total: ${total}`, {
            rowCount: stock?.length,
            rows: stock?.map((s: any) => `Qty: ${s.quantity}, Unit: ${s.unit_type}, Fact: ${s.factory_id}`)
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

        // 1. Fetch specific balances to deduct from sequentially
        const query = supabase
            .from('stock_balances')
            .select('id, quantity, cap_id, inner_id, unit_type')
            .eq('product_id', productId)
            .eq('state', sourceState)
            .or(`factory_id.eq.${factoryId},factory_id.is.null`)
            .eq('unit_type', unitType);

        const { data: balances, error: stockError } = await query;

        if (stockError) throw new Error(`Failed to fetch stock for reservation: ${stockError.message}`);

        let remainingToReserve = quantity;
        const sortedBalances = [...(balances || [])].sort((a, b) => Number(b.quantity) - Number(a.quantity));

        for (const balance of sortedBalances) {
            if (remainingToReserve <= 0) break;

            const deductAmount = Math.min(remainingToReserve, Number(balance.quantity));

            // Deduct from source state using ID (Most reliable for NULL identity columns)
            const { error: deductError } = await supabase.rpc('adjust_stock_by_id', {
                p_id: balance.id,
                p_quantity_change: -deductAmount
            });

            if (deductError) {
                logger.error('Failed to deduct stock during sequential reservation', { error: deductError.message, productId, deductAmount, unitType, balance });
                throw new Error(`Failed to deduct ${sourceState} stock: ${deductError.message}`);
            }

            // Add to reserved state
            // Robust check for existing reserved row to avoid ON CONFLICT NULL issues
            const reservedQuery = supabase
                .from('stock_balances')
                .select('id')
                .eq('product_id', productId)
                .eq('factory_id', factoryId)
                .eq('state', 'reserved')
                .eq('unit_type', unitType);
            
            if (balance.cap_id) reservedQuery.eq('cap_id', balance.cap_id);
            else reservedQuery.is('cap_id', null);

            if (balance.inner_id) reservedQuery.eq('inner_id', balance.inner_id);
            else reservedQuery.is('inner_id', null);

            const { data: existingReserved } = await reservedQuery.maybeSingle();

            if (existingReserved) {
                await supabase.rpc('adjust_stock_by_id', {
                    p_id: existingReserved.id,
                    p_quantity_change: deductAmount
                });
            } else {
                const { error: reserveError } = await supabase.rpc('adjust_stock', {
                    p_product_id: productId,
                    p_factory_id: factoryId,
                    p_state: 'reserved',
                    p_quantity_change: deductAmount,
                    p_cap_id: balance.cap_id,
                    p_inner_id: balance.inner_id,
                    p_unit_type: unitType
                });

                if (reserveError) {
                    logger.error('Failed to add to reserved stock during sequential reservation', { error: reserveError.message, productId, deductAmount, unitType, balance });
                    throw new Error(`Failed to update reserved stock: ${reserveError.message}`);
                }
            }

            remainingToReserve -= deductAmount;
        }

        if (remainingToReserve > 0) {
            // Log warning instead of throwing, so the order creation succeeds as backordered.
            logger.warn(`Could not fully reserve stock for order item. Missing ${remainingToReserve} units.`, { productId, quantity, unitType, factoryId });
        }

        // 3. Log Audit Trail
        try {
            await inventoryService.logTransaction('reserve', productId, quantity, unitType, sourceState, 'reserved', factoryId);
        } catch (auditError: any) {
            logger.error('Failed to log inventory transaction for stock reservation', { error: auditError.message, productId, quantity, factoryId });
        }
        logger.info('Stock reserved successfully', { productId, quantity, unitType, factoryId });
    }

    private async createProductionRequest(productId: string | null, factoryId: string, quantity: number, unitType: string, orderId: string, capId?: string, innerId?: string) {
        // 1. Create Request
        const { data: request, error: reqError } = await supabase
            .from('production_requests')
            .insert({
                product_id: productId || null,
                cap_id: capId || null,
                inner_id: innerId || null,
                factory_id: factoryId,
                quantity: quantity,
                unit_type: unitType,
                sales_order_id: orderId,
                status: 'pending'
            })
            .select()
            .single();

        if (reqError) {
            logger.error('Failed to create production request', { error: reqError.message, productId, capId, factoryId, quantity, orderId });
            throw new Error(`Failed to create production request: ${reqError.message}`);
        }

        // 2. Side Effects: Emit Event
        eventBus.emit(SystemEvents.PRODUCTION_REQUEST_CREATED, {
            request_id: request.id,
            product_id: productId,
            cap_id: capId,
            order_id: orderId,
            factory_id: factoryId,
            quantity: quantity,
            unit_type: unitType
        });

        logger.info('Production request created', { requestId: request.id, productId, capId, quantity, orderId });
    }

    private async unreserveStock(productId: string | null, quantity: number, unitType: string, factoryId: string, capId?: string) {
        const stateMapping: Record<string, string> = {
            'loose': 'semi_finished',
            'packet': 'packed',
            'bundle': 'finished'
        };
        const targetState = stateMapping[unitType] || 'finished';

        // 1. Fetch ALL reserved stock records
        const tableName = capId ? 'cap_stock_balances' : 'stock_balances';
        const idField = capId ? 'cap_id' : 'product_id';
        const idValue = capId || productId;

        let query;
        if (capId) {
            query = supabase
                .from('cap_stock_balances')
                .select('quantity')
                .eq('cap_id', capId)
                .eq('state', 'reserved')
                .eq('factory_id', factoryId)
                .eq('unit_type', unitType);
        } else {
            query = supabase
                .from('stock_balances')
                .select('quantity, cap_id, inner_id')
                .eq('product_id', productId!)
                .eq('state', 'reserved')
                .eq('factory_id', factoryId)
                .eq('unit_type', unitType);
        }

        const { data: balances, error: fetchError } = await query;

        if (fetchError) {
            logger.error('Failed to fetch reserved stock for unreservation', { error: fetchError.message, productId, capId, factoryId, unitType });
            throw new Error(`Failed to fetch reserved stock: ${fetchError.message}`);
        }

        const totalReserved = balances?.reduce((sum, b) => sum + Number(b.quantity), 0) || 0;
        if (totalReserved < quantity) {
            logger.warn('Attempted to unreserve more than available in reserved state', { productId, capId, quantity, totalReserved });
        }

        let remainingToUnreserve = Math.min(quantity, totalReserved);
        const sortedBalances = [...(balances || [])].sort((a, b) => Number(b.quantity) - Number(a.quantity));

        for (const balance of sortedBalances) {
            if (remainingToUnreserve <= 0) break;

            const moveAmount = Math.min(remainingToUnreserve, Number(balance.quantity));

            // Deduct from reserved
            const adjustParams: any = {
                p_factory_id: factoryId,
                p_state: 'reserved',
                p_quantity_change: -moveAmount,
                p_cap_id: capId || (balance as any).cap_id,
                p_unit_type: unitType
            };
            if (!capId) {
                adjustParams.p_product_id = productId;
                adjustParams.p_inner_id = (balance as any).inner_id;
            }

            const { error: deductError } = await supabase.rpc(capId ? 'adjust_cap_stock' : 'adjust_stock', adjustParams);
            if (deductError) throw new Error(`Failed to deduct reserved stock: ${deductError.message}`);

            // Add back to target state
            adjustParams.p_state = targetState;
            adjustParams.p_quantity_change = moveAmount;
            
            const { error: addBackError } = await supabase.rpc(capId ? 'adjust_cap_stock' : 'adjust_stock', adjustParams);
            if (addBackError) throw new Error(`Failed to add back to target stock: ${addBackError.message}`);

            remainingToUnreserve -= moveAmount;
        }

        // 3. Log Audit Trail
        try {
            await inventoryService.logTransaction('unreserve', (productId || capId)!, quantity, unitType, 'reserved', targetState, factoryId);
        } catch (auditError: any) {
            logger.error('Failed to log inventory transaction for stock unreservation', { error: auditError.message, productId, capId, quantity, factoryId });
        }
    }

    private async deliverStock(productId: string | null, quantity: number, unitType: string, factoryId: string, capId?: string) {
        // Permanently remove from reserved (stock is sold)
        // 1. Fetch ALL reserved stock records
        const tableName = capId ? 'cap_stock_balances' : 'stock_balances';
        const idField = capId ? 'cap_id' : 'product_id';
        const idValue = capId || productId;

        let query;
        if (capId) {
            query = supabase
                .from('cap_stock_balances')
                .select('quantity')
                .eq('cap_id', capId)
                .eq('state', 'reserved')
                .eq('factory_id', factoryId)
                .eq('unit_type', unitType);
        } else {
            query = supabase
                .from('stock_balances')
                .select('quantity, cap_id')
                .eq('product_id', productId!)
                .eq('state', 'reserved')
                .eq('factory_id', factoryId)
                .eq('unit_type', unitType);
        }

        const { data: balances, error: fetchError } = await query;

        if (fetchError) {
            logger.error('Failed to fetch reserved stock for delivery', { error: fetchError.message, productId, capId, factoryId, unitType });
            throw new Error(`Failed to fetch reserved stock: ${fetchError.message}`);
        }

        const totalReserved = balances?.reduce((sum, b) => sum + Number(b.quantity), 0) || 0;
        if (totalReserved < quantity) {
            logger.warn('Attempted to deliver more than available in reserved state', { productId, capId, quantity, totalReserved });
        }

        let remainingToDeliver = Math.min(quantity, totalReserved);
        const sortedBalances = [...(balances || [])].sort((a, b) => Number(b.quantity) - Number(a.quantity));

        for (const balance of sortedBalances) {
            if (remainingToDeliver <= 0) break;

            const deliverAmount = Math.min(remainingToDeliver, Number(balance.quantity));

            // Deduct from reserved atomically and permanently (since it's delivered)
            const adjustParams: any = {
                p_factory_id: factoryId,
                p_state: 'reserved',
                p_quantity_change: -deliverAmount,
                p_cap_id: capId || (balance as any).cap_id,
                p_unit_type: unitType
            };
            if (!capId) {
                adjustParams.p_product_id = productId;
            }

            const { error: deductError } = await supabase.rpc(capId ? 'adjust_cap_stock' : 'adjust_stock', adjustParams);
            if (deductError) throw new Error(`Failed to deduct reserved stock for delivery: ${deductError.message}`);

            remainingToDeliver -= deliverAmount;
        }

        // Log Audit Trail
        try {
            await inventoryService.logTransaction('delivery', (productId || capId)!, quantity, unitType, 'reserved', null, factoryId);
        } catch (auditError: any) {
            logger.error('Failed to log inventory transaction for stock delivery', { error: auditError.message, productId, capId, quantity, factoryId });
        }
    }

    async getAllOrders(filters?: { status?: string; factoryId?: string; page?: number; size?: number }) {
        const { from, to } = getPagination(filters?.page, filters?.size);

        let query = supabase
            .from('sales_orders')
            .select(`
                *,
                customer:customers(name, phone, type),
                sales_order_items(
                    id,
                    product_id,
                    cap_id,
                    quantity,
                    quantity_shipped,
                    quantity_prepared,
                    quantity_reserved,
                    unit_type,
                    unit_price,
                    is_backordered,
                    is_prepared,
                    prepared_at,
                    include_inner,
                    inner_id,
                    products(name, size, color, selling_price, factory_id),
                    caps(name, factory_id)
                ),
                production_requests(product_id, cap_id, status)
            `, { count: 'exact' });

        if (filters?.status) {
            const statuses = filters.status.split(',');
            if (statuses.length > 1) {
                query = query.in('status', statuses);
            } else {
                query = query.eq('status', filters.status);
            }
        }

        if (filters?.factoryId) {
            query = query.eq('sales_order_items.products.factory_id', filters.factoryId);
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
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
                    cap_id,
                    quantity,
                    quantity_shipped,
                    quantity_prepared,
                    quantity_reserved,
                    unit_type,
                    unit_price,
                    is_backordered,
                    is_prepared,
                    include_inner,
                    inner_id,
                    products(name, size, color, selling_price, factory_id),
                    caps(name, factory_id)
                ),
                production_requests(product_id, cap_id, status)
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
            // Use quantity_reserved as the source of truth for what needs to be unreserved.
            if (item.quantity_reserved && item.quantity_reserved > 0) {
                await this.unreserveStock(item.product_id, item.quantity_reserved, item.unit_type, factoryId);
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
            const unit_type = item.unit_type || (item.cap_id ? 'loose' : 'bundle');
            let factoryId = MAIN_FACTORY_ID;
            let sellingPrice = 0;

            if (item.product_id) {
                const { data: product } = await supabase
                    .from('products')
                    .select('selling_price, factory_id')
                    .eq('id', item.product_id)
                    .single();
                factoryId = product?.factory_id || MAIN_FACTORY_ID;
                sellingPrice = product?.selling_price || 0;
            } else if (item.cap_id) {
                const { data: cap } = await supabase
                    .from('caps')
                    .select('factory_id')
                    .eq('id', item.cap_id)
                    .single();
                factoryId = cap?.factory_id || MAIN_FACTORY_ID;
            }

            const availableStock = await this.getAvailableStock(item.product_id || null, unit_type, factoryId, item.cap_id);
            const isBackordered = availableStock < item.quantity;

            // Insert new item
            const { error: itemError } = await supabase
                .from('sales_order_items')
                .insert({
                    order_id: id,
                    product_id: item.product_id || null,
                    cap_id: item.cap_id || null,
                    quantity_reserved: 0,
                    unit_type: unit_type,
                    unit_price: item.unit_price ?? sellingPrice,
                    is_backordered: isBackordered
                });

            if (itemError) {
                logger.error('Failed to insert new item during order update', { error: itemError.message, orderId: id, item });
                throw new Error(`Failed to update order item: ${itemError.message}`);
            }

            // Demand Signaling
            if (isBackordered) {
                const needed = item.quantity - availableStock;
                await this.createProductionRequest(item.product_id || null, factoryId, needed, unit_type, id, item.cap_id);
            }
        }

        // 3. Side Effects: Emit Event
        eventBus.emit(SystemEvents.SALES_ORDER_UPDATED, {
            order_id: id,
            userId: data.user_id,
            changes: data
        });

        logger.info('Sales order updated successfully', { orderId: id, userId: data.user_id });
        return this.getOrderById(id);
    }

    async updateOrderStatus(id: string, status: 'reserved' | 'delivered' | 'cancelled' | 'pending' | 'partially_delivered', userId: string) {
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
                if (item.quantity_reserved && item.quantity_reserved > 0) {
                    const factoryId = (item.products as any)?.factory_id || (item.caps as any)?.factory_id || MAIN_FACTORY_ID;
                    await this.deliverStock(item.product_id, item.quantity_reserved, item.unit_type, factoryId, item.cap_id);
                }
            }
            logger.info('Order delivered, stock deducted', { orderId: id, userId });
        } else if (status === 'cancelled') {
            // Return stock to inventory (only for those that were NOT backordered, as backordered items never left inventory)
            for (const item of order.sales_order_items) {
                if (item.quantity_reserved && item.quantity_reserved > 0) {
                    const factoryId = (item.products as any)?.factory_id || (item.caps as any)?.factory_id || MAIN_FACTORY_ID;
                    await this.unreserveStock(item.product_id, item.quantity_reserved, item.unit_type, factoryId, item.cap_id);
                }
                
                if (item.is_backordered) {
                    // Cancel the production request if it exists
                    const { error: cancelReqError } = await supabase
                        .from('production_requests')
                        .update({ status: 'cancelled' })
                        .eq('sales_order_id', id)
                        .or(`product_id.eq.${item.product_id},cap_id.eq.${item.cap_id}`);
                    if (cancelReqError) {
                        logger.error('Failed to cancel production request for cancelled order item', { error: cancelReqError.message, orderId: id, productId: item.product_id, capId: item.cap_id });
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

        // Side Effects: Emit Event
        eventBus.emit(SystemEvents.SALES_ORDER_STATUS_CHANGED, {
            order_id: id,
            userId: userId,
            previous_status: order.status,
            new_status: status
        });

        logger.info('Sales order status updated', { orderId: id, newStatus: status, userId });
        return this.getOrderById(id);
    }

    async syncOrderStatus(orderId: string) {
        if (!orderId) {
            logger.warn('Skipping order status sync: No orderId provided');
            return;
        }

        // 1. Fetch all items for this order to check backorder status
        const { data: items, error: itemsError } = await supabase
            .from('sales_order_items')
            .select('is_backordered')
            .eq('order_id', orderId);

        if (itemsError) {
            logger.error('Failed to fetch items for order status sync', { error: itemsError.message, orderId });
            return;
        }

        const anyBackordered = items?.some(item => item.is_backordered) || false;

        if (!anyBackordered) {
            // 2. Fetch current order status
            const { data: order, error: orderError } = await supabase
                .from('sales_orders')
                .select('status')
                .eq('id', orderId)
                .maybeSingle();

            if (orderError) {
                logger.error('Failed to fetch order for status sync', { error: orderError.message, orderId });
                return;
            }

            if (!order) {
                logger.warn('Order not found during status sync', { orderId });
                return;
            }

            // REMOVED automatic transition to 'reserved' here.
            // Stock reservation and status change to 'reserved' MUST be a manual, 
            // intentional action by the PM in the Order Preparation screen.
            /*
            if (order.status === 'pending') {
                const { error: updateError } = await supabase
                    .from('sales_orders')
                    .update({ status: 'reserved', updated_at: new Date().toISOString() })
                    .eq('id', orderId);
                ...
            }
            */
            logger.info('Order transition to reserved skipped - waiting for manual PM preparation', { orderId });
        }
    }

    async prepareOrderItems(orderId: string, items: Array<{ itemId: string; quantity: number }>, userId: string) {
        logger.info('Executing atomic order preparation:', { orderId, itemCount: items.length, userId });

        // Map item ID variants (itemId vs item_id) to the format expected by RPC
        const mappedItems = items.map(i => ({
            item_id: (i as any).itemId || (i as any).item_id,
            quantity: i.quantity
        }));

        const { data: result, error: rpcError } = await supabase.rpc('prepare_order_items_atomic', {
            p_order_id: orderId,
            p_items: mappedItems,
            p_user_id: userId
        });

        if (rpcError) {
            logger.error('prepare_order_items_atomic failed:', rpcError);
            // Handle specific PG raises if needed, otherwise generic AppError
            throw new AppError(`Order preparation failed: ${rpcError.message}`, 500);
        }

        logger.info('Sales order items prepared atomically', { orderId, updatedCount: result.reserved_count });
        
        // Side Effects: Emit Event
        eventBus.emit(SystemEvents.SALES_ORDER_ITEMS_PREPARED, {
            order_id: orderId,
            userId: userId,
            items: mappedItems
        });
        
        // Return full order with updated statuses for the UI/Mobile App
        return this.getOrderById(orderId);
    }

    async processDelivery(orderId: string, deliveryData: {
        items: Array<{ item_id: string; quantity: number; unit_price: number }>;
        discount_type?: 'percentage' | 'fixed';
        discount_value?: number;
        payment_mode: 'cash' | 'credit';
        credit_deadline?: string;
        initial_payment?: number;
        payment_method?: string;
        notes?: string;
        user_id: string;
    }) {
        logger.info('Processing partial delivery via RPC', { orderId, itemsCount: deliveryData.items.length, userId: deliveryData.user_id });

        // Call the atomic RPC
        const { data, error } = await supabase.rpc('process_partial_dispatch', {
            p_order_id: orderId,
            p_items: deliveryData.items,
            p_discount_type: deliveryData.discount_type || 'fixed',
            p_discount_value: deliveryData.discount_value || 0,
            p_payment_mode: deliveryData.payment_mode || 'cash',
            p_credit_deadline: deliveryData.credit_deadline ?? null,
            p_initial_payment: deliveryData.initial_payment || 0,
            p_notes: deliveryData.notes || '',
            p_user_id: deliveryData.user_id,
            p_payment_method: deliveryData.payment_method || 'cash'
        });

        if (error) {
            logger.error('Failed to process partial delivery via RPC', { error: error.message, orderId, userId: deliveryData.user_id });
            throw new Error(error.message);
        }

        logger.info('Partial delivery processed successfully via RPC', { orderId, result: data, userId: deliveryData.user_id });

        // 2. Side Effects: Emit Payment Event if initial payment was made
        if (deliveryData.initial_payment && deliveryData.initial_payment > 0 && data.payment_id) {
            // We need the order's customer_id and factory_id for the event
            const updatedOrder = await this.getOrderById(orderId);
            if (updatedOrder) {
                const factoryId = (updatedOrder.sales_order_items?.[0]?.products as any)?.factory_id || 
                                (updatedOrder.sales_order_items?.[0]?.caps as any)?.factory_id || 
                                'MAIN_FACTORY'; // Safe fallback
                
                eventBus.emit(SystemEvents.SALES_PAYMENT_RECORDED, {
                    payment_id: data.payment_id,
                    order_id: orderId,
                    customer_id: updatedOrder.customer_id,
                    amount: Number(deliveryData.initial_payment),
                    payment_mode: deliveryData.payment_method || 'cash',
                    userId: deliveryData.user_id,
                    factory_id: factoryId
                });
                logger.info('Sales payment event emitted for initial payment', { orderId, paymentId: data.payment_id });
                return updatedOrder;
            }
        }

        // Return the updated order
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
        const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .insert({
                sales_order_id: orderId,
                customer_id: order.customer_id,
                amount: paymentData.amount,
                payment_method: paymentData.payment_method,
                notes: paymentData.notes,
                recorded_by: paymentData.user_id
            })
            .select()
            .single();

        if (paymentError) {
            logger.error('Failed to record payment', { error: paymentError.message, orderId, paymentData });
            throw new Error(`Failed to record payment: ${paymentError.message}`);
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

        // 4. Side Effects: Emit Event
        const factoryId = (order.sales_order_items?.[0]?.products as any)?.factory_id || MAIN_FACTORY_ID;

        eventBus.emit(SystemEvents.SALES_PAYMENT_RECORDED, {
            payment_id: payment.id,
            order_id: orderId,
            customer_id: order.customer_id,
            amount: paymentData.amount,
            payment_mode: paymentData.payment_method,
            userId: paymentData.user_id,
            factory_id: factoryId
        });

        // 5. Notify if balance is cleared
        if (newBalanceDue === 0) {
            const { error: notificationError } = await supabase.from('notifications').insert({
                user_id: order.created_by,
                title: 'Payment Completed',
                message: `Order #${(orderId || 'ORDER').slice(-6).toUpperCase()} has been fully paid.`,
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
            order_number: `#${(o.id || 'ORDER').slice(-6).toUpperCase()}`
        }))) || [];

        const ordersWithBalance = (orders as any[])?.filter((o: any) => (o.balance_due || 0) > 0).map((o: any) => ({
            ...o,
            order_number: `#${(o.id || 'ORDER').slice(-6).toUpperCase()}`
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
                if (item.quantity_reserved && item.quantity_reserved > 0) {
                    const factoryId = (item.products as any)?.factory_id || MAIN_FACTORY_ID;
                    await this.unreserveStock(item.product_id, item.quantity_reserved, item.unit_type, factoryId);
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
        const today = getIsoLocalDate();

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
            message: `Order #${(order.id || 'ORDER').slice(-6).toUpperCase()} is overdue. Balance: ₹${order.balance_due}. Deadline was ${order.credit_deadline}.`,
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

