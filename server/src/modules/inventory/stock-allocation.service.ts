import { supabase } from '../../config/supabase';
import { pushNotificationService } from '../notifications/push-notification.service';
import { AppError } from '../../utils/AppError';
import {
    resolvePrepareDimensionsForProductionRequest,
    sumQuantityMatchingPrepareDimensions,
} from './prepare-stock-dimensions';

const MAIN_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';

export class StockAllocationService {
    /**
     * Smart FIFO Allocation - DEPRECATED in favor of manual fulfillment
     * Triggered when stock increases in a "ready" state (semi_finished, packed, finished)
     */
    async allocateStock(productId: string, state: string, availableQty: number, factoryId: string) {
        // This is now disabled to allow manual fulfillment by Product Managers
        console.log(`Automated allocation skipped for ${productId} in ${state}. Manual fulfillment required.`);
        return;
    }

    /**
     * Manual Fulfillment for a specific Production Request
     * Triggered by Product Manager in Mobile App
     */
    async fulfillRequestManually(requestId: string, userId: string) {
        // 1. Fetch Request with item details
        const { data: request, error: reqError } = await supabase
            .from('production_requests')
            .select(`
                *,
                products (name, weight_grams)
            `)
            .eq('id', requestId)
            .single();

        if (reqError || !request) throw new Error(`Production request not found: ${reqError?.message}`);
        if (request.status === 'completed') throw new Error('Request already completed');

        const unitType = request.unit_type;
        const dbUnitTypes = unitType === 'loose' ? ['loose', ''] : [unitType];
        
        // Match state mapping from refine prepare_order_items_atomic RPC
        let fromState = 'finished';
        if (request.product_id) {
            const stateMapping: Record<string, string> = {
                'loose': 'semi_finished',
                'packet': 'packed',
                'bundle': 'finished'
            };
            fromState = stateMapping[unitType] || 'finished';
        }

        if (!fromState) throw new Error(`Invalid unit type for fulfillment: ${unitType}`);

        // 2. Validate sufficient stock in the same dimensional slice prepare_order_items_atomic uses
        let totalAvailable = 0;
        if (request.product_id) {
            const dims = await resolvePrepareDimensionsForProductionRequest(supabase, {
                salesOrderId: request.sales_order_id,
                productId: request.product_id,
                requestInnerId: request.inner_id,
                requestCapId: request.cap_id,
            });

            const { data: balances, error: stockError } = await supabase
                .from('stock_balances')
                .select('quantity, cap_id, inner_id')
                .eq('product_id', request.product_id)
                .eq('state', fromState)
                .in('unit_type', dbUnitTypes)
                .or(
                    `factory_id.eq.${request.factory_id},factory_id.is.null`
                );

            if (stockError) throw new Error(`Stock fetch error: ${stockError.message}`);
            totalAvailable = sumQuantityMatchingPrepareDimensions(balances, dims);

            if (totalAvailable < request.quantity) {
                const combo = `cap_id=${dims.capId ?? '<NULL>'}, inner_id=${dims.innerId ?? '<NULL>'}, include_inner=${dims.includeInner}`;
                throw new AppError(
                    `Insufficient ${unitType} stock (${fromState}) for this order line (${combo}). ` +
                        `Have ${totalAvailable}, need ${request.quantity}. ` +
                        `Produce or bundle stock that matches this cap/inner combination, then mark prepared again.`,
                    400
                );
            }
        } else if (request.cap_id) {
            const { data: balances, error: stockError } = await supabase
                .from('cap_stock_balances')
                .select('quantity')
                .eq('cap_id', request.cap_id)
                .eq('state', fromState)
                .eq('factory_id', request.factory_id)
                .in('unit_type', dbUnitTypes);

            if (stockError) throw new Error(`Cap Stock fetch error: ${stockError.message}`);
            totalAvailable = balances?.reduce((sum, b) => sum + Number(b.quantity), 0) || 0;
        }

        if (request.product_id) {
            // Product branch already validated above with dimensional match
        } else if (totalAvailable < request.quantity) {
            throw new AppError(`Insufficient ${unitType} stock (${fromState}) to mark as prepared. Have ${totalAvailable}, need ${request.quantity}. Please log production first.`, 400);
        }

        // 3. Mark request as prepared
        // This is a status-only signal. Stock reservation is performed manually in the Order Preparation screen.

        // 4. Mark request as prepared
        const { data: updatedRequest, error: updateError } = await supabase
            .from('production_requests')
            .update({ status: 'prepared', updated_at: new Date().toISOString() })
            .eq('id', requestId)
            .select(`
                *,
                products (name, size, color, factory_id),
                caps (name, color, factory_id),
                inners (color, inner_templates(name)),
                sales_order:sales_orders!left(id, status)
            `)
            .single();

        if (updateError) throw new Error(`Failed to complete request: ${updateError.message}`);

        // 6. Notify Sales Admin who created the order
        const { data: order } = await supabase
            .from('sales_orders')
            .select('user_id')
            .eq('id', request.sales_order_id)
            .single();

        if (order?.user_id) {
            await this.notifyfulfillment(order.user_id, request.sales_order_id, request.product_id, request.quantity, unitType, request.cap_id);
        }

        // Return the updated row only — callers (e.g. PATCH /production/requests) expect the same
        // shape as GET /production/requests, not { success, request }.
        return updatedRequest;
    }

    private async reserveFulfillment(productId: string, fromState: string, quantity: number, factoryId: string, dbUnitType: string, preFetchedBalances: any[] = []) {
        let balances = preFetchedBalances;
        
        if (balances.length === 0) {
            const { data } = await supabase
                .from('stock_balances')
                .select('quantity, cap_id')
                .eq('product_id', productId)
                .eq('state', fromState)
                .eq('factory_id', factoryId)
                .eq('unit_type', dbUnitType);
            balances = data || [];
        }

        let remainingToDeduct = quantity;
        const sortedBalances = [...balances].sort((a, b) => Number(b.quantity) - Number(a.quantity));

        for (const balance of sortedBalances) {
            if (remainingToDeduct <= 0) break;

            const deductAmount = Math.min(remainingToDeduct, Number(balance.quantity));

            // Deduct from source state
            const { error: deductError } = await supabase.rpc('adjust_stock', {
                p_product_id: productId,
                p_factory_id: factoryId,
                p_state: fromState,
                p_quantity_change: -deductAmount,
                p_cap_id: balance.cap_id,
                p_unit_type: dbUnitType
            });
            if (deductError) throw new Error(`Failed to deduct stock: ${deductError.message}`);

            // Add to reserved state
            const { error: reserveError } = await supabase.rpc('adjust_stock', {
                p_product_id: productId,
                p_factory_id: factoryId,
                p_state: 'reserved',
                p_quantity_change: deductAmount,
                p_cap_id: balance.cap_id,
                p_unit_type: dbUnitType
            });
            if (reserveError) throw new Error(`Failed to update reserved stock: ${reserveError.message}`);

            remainingToDeduct -= deductAmount;
        }

        if (remainingToDeduct > 0) {
            throw new Error(`Insufficient stock found during sequential deduction. Missing ${remainingToDeduct} units.`);
        }
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

    private async notifyfulfillment(userId: string, orderId: string, productId: string | null, quantity: number, unitType: string, capId?: string) {
        let name = 'Item';
        if (productId) {
            const { data: product } = await supabase.from('products').select('name').eq('id', productId).single();
            name = product?.name || 'Product';
        } else if (capId) {
            const { data: cap } = await supabase.from('caps').select('name').eq('id', capId).single();
            name = cap?.name || 'Cap';
        }

        await supabase.from('notifications').insert({
            user_id: userId,
            title: 'Backorder Fulfilled',
            message: `Stock for Order #${(orderId || 'ORDER').slice(-6).toUpperCase()} is now ready: ${quantity} ${unitType} of ${name}.`,
            type: 'backorder_fulfillment',
            metadata: { order_id: orderId, product_id: productId, cap_id: capId }
        });

        // Push Notification to Sales Admin
        await pushNotificationService.sendToUsers([userId], {
            title: 'Backorder Fulfilled',
            body: `Stock for Order #${(orderId || 'ORDER').slice(-6).toUpperCase()} is now ready: ${quantity} ${unitType} of ${name}.`,
            data: { order_id: orderId, type: 'order_prepared' }
        });
    }
}

export const stockAllocationService = new StockAllocationService();
