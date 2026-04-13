import { supabase } from '../../config/supabase';
import { AppError } from '../../utils/AppError';
import logger from '../../utils/logger';
import { eventBus } from '../../core/eventBus';
import { SystemEvents } from '../../core/events';
import { stockAllocationService } from '../inventory/stock-allocation.service';
import {
    resolvePrepareDimensionsFromSoiRows,
    stockBalanceMatchesPrepareDimensions,
} from '../inventory/prepare-stock-dimensions';

export class ProductionRequestService {
    async getProductionRequests(factoryId?: string) {
        let query = supabase
            .from('production_requests')
            .select(`
                *,
                products (name, size, color, factory_id),
                caps (name, color, factory_id),
                inners (color, inner_templates(name)),
                sales_order:sales_orders!left(id, status)
            `)
            .order('created_at', { ascending: false });

        if (factoryId) {
            query = query.eq('factory_id', factoryId);
        }

        const { data: rawData, error } = await query;
        if (error) {
            logger.error('Get production requests error:', error);
            throw new AppError(error.message, 500);
        }

        // Hide demand for cancelled sales orders (stale PRs if cancel path missed a row)
        const dataFiltered = (rawData || []).filter((r: any) => {
            const so = r.sales_order;
            const st = so && typeof so === 'object' ? (so as { status?: string }).status : null;
            if (r.sales_order_id && st === 'cancelled') return false;
            return true;
        });

        const productIds = [...new Set(dataFiltered.map(r => r.product_id).filter(Boolean))];
        const innerIds = [...new Set(dataFiltered.map(r => r.inner_id).filter(Boolean))];
        
        const { data: stockData } = await supabase
            .from('stock_balances')
            .select('product_id, quantity, state, factory_id, unit_type, cap_id, inner_id')
            .in('product_id', productIds);

        const { data: innerStockData } = await supabase
            .from('inner_stock_balances')
            .select('inner_id, quantity, factory_id')
            .in('inner_id', innerIds);

        const orderIds = [...new Set(dataFiltered.map((r) => r.sales_order_id).filter(Boolean))];
        let salesOrderItemsForDims: any[] = [];
        if (orderIds.length) {
            const { data: soi } = await supabase
                .from('sales_order_items')
                .select('order_id, product_id, inner_id, cap_id, include_inner')
                .in('order_id', orderIds);
            salesOrderItemsForDims = soi ?? [];
        }

        const stateMapping: Record<string, string> = {
            'loose': 'semi_finished',
            'packet': 'packed',
            'bundle': 'finished',
            'bag': 'finished',
            'box': 'finished'
        };

        return dataFiltered.map((req) =>
            this.enrichRequestWithStock(req, stockData, innerStockData, stateMapping, salesOrderItemsForDims)
        );
    }

    private enrichRequestWithStock(
        req: any,
        stockData: any[] | null,
        innerStockData: any[] | null,
        stateMapping: Record<string, string>,
        salesOrderItemsForDims: any[] = []
    ) {
        // A standalone inner request has inner_id set but no product_id and no cap_id.
        // A tub/product request that *includes* an inner also has inner_id set — it must NOT
        // be classified as an inner request; it should be shown as a product request with
        // the "REQUIRES INNER" badge instead.
        const isInnerReq = !!req.inner_id && !req.product_id && !req.cap_id;

        if (isInnerReq) {
            const innerStock = innerStockData?.filter(s => s.inner_id === req.inner_id) || [];
            const matchingStock = innerStock.filter(s => s.factory_id === req.factory_id || !s.factory_id);
            const availableStock = matchingStock.reduce((sum, s) => sum + Number(s.quantity), 0);
            
            const innerData = Array.isArray(req.inners) ? req.inners[0] : req.inners;
            const templateData = innerData?.inner_templates;
            const template = Array.isArray(templateData) ? templateData[0] : templateData;
            
            req.products = {
                name: `${template?.name || 'Inner'}`,
                color: innerData?.color || 'N/A',
                size: null
            };

            return {
                ...req,
                is_inner: true,
                include_inner: false,
                available_stock: availableStock,
                is_satisfiable: availableStock >= req.quantity,
                stock_summary: null
            };
        }

        const unitType = (req.unit_type || 'bundle').toLowerCase();
        const requiredState = stateMapping[unitType];
        const productStock = stockData?.filter((s) => s.product_id === req.product_id) || [];

        const dims = resolvePrepareDimensionsFromSoiRows(salesOrderItemsForDims, {
            sales_order_id: req.sales_order_id,
            product_id: req.product_id,
            inner_id: req.inner_id,
            cap_id: req.cap_id,
        });

        const matchingStock = productStock.filter(
            (s) =>
                s.state === requiredState &&
                (s.factory_id === req.factory_id || s.factory_id == null) &&
                s.unit_type === unitType &&
                stockBalanceMatchesPrepareDimensions(s, dims)
        );

        const availableStock = matchingStock.reduce((sum, s) => sum + Number(s.quantity), 0);

        // Same cap/inner/include_inner slice as prepare — not all stock for the product SKU
        const comboStock = (s: { cap_id?: string | null; inner_id?: string | null }) =>
            stockBalanceMatchesPrepareDimensions(s, dims);

        const stockSummary = {
            loose: productStock
                .filter((s) => s.state === 'semi_finished' && comboStock(s))
                .reduce((sum, s) => sum + Number(s.quantity), 0),
            packed: productStock
                .filter((s) => s.state === 'packed' && comboStock(s))
                .reduce((sum, s) => sum + Number(s.quantity), 0),
            finished: productStock
                .filter((s) => s.state === 'finished' && comboStock(s))
                .reduce((sum, s) => sum + Number(s.quantity), 0),
            factory_specific: {
                loose: productStock
                    .filter(
                        (s) =>
                            s.state === 'semi_finished' &&
                            comboStock(s) &&
                            (s.factory_id === req.factory_id || s.factory_id == null)
                    )
                    .reduce((sum, s) => sum + Number(s.quantity), 0),
                packed: productStock
                    .filter(
                        (s) =>
                            s.state === 'packed' &&
                            comboStock(s) &&
                            (s.factory_id === req.factory_id || s.factory_id == null)
                    )
                    .reduce((sum, s) => sum + Number(s.quantity), 0),
                finished: productStock
                    .filter(
                        (s) =>
                            s.state === 'finished' &&
                            comboStock(s) &&
                            (s.factory_id === req.factory_id || s.factory_id == null)
                    )
                    .reduce((sum, s) => sum + Number(s.quantity), 0),
            },
        };

        let requiredInnerName: string | null = null;
        if (dims.includeInner && req.inner_id) {
            const innerData = Array.isArray(req.inners) ? req.inners[0] : req.inners;
            const templateData = innerData?.inner_templates;
            const template = Array.isArray(templateData) ? templateData[0] : templateData;
            requiredInnerName = template?.name || 'Inner';
        }

        return {
            ...req,
            is_inner: false,
            include_inner: dims.includeInner,
            available_stock: availableStock,
            is_satisfiable: availableStock >= req.quantity,
            stock_summary: stockSummary,
            required_inner_name: requiredInnerName
        };
    }

    async updateProductionRequestStatus(requestId: string, status: string, userId: string) {
        if (status === 'completed' || status === 'prepared') {
            const updatedRow = await stockAllocationService.fulfillRequestManually(requestId, userId);

            eventBus.emit(SystemEvents.PRODUCTION_REQUEST_STATUS_UPDATED, {
                request_id: requestId,
                userId: userId,
                status: status
            });

            // Same enriched payload as GET /requests (mobile parses ProductionRequest.fromJson)
            return this.enrichUpdatedRequestRow(updatedRow);
        }

        const { data, error } = await supabase
            .from('production_requests')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', requestId)
            .select(`
                *,
                products (name, size, color, factory_id),
                caps (name, color, factory_id),
                inners (color, inner_templates(name)),
                sales_order:sales_orders!left(id, status)
            `)
            .single();

        if (error) {
            logger.error('Update production request status error:', error);
            throw new AppError(error.message, 500);
        }

        eventBus.emit(SystemEvents.PRODUCTION_REQUEST_STATUS_UPDATED, {
            request_id: requestId,
            userId: userId,
            status: status
        });

        return this.enrichUpdatedRequestRow(data);
    }

    /** Match GET /requests list item shape (stock + flags) for PATCH responses. */
    private async enrichUpdatedRequestRow(data: any) {
        const { data: stockData } = data.product_id
            ? await supabase
                  .from('stock_balances')
                  .select('product_id, quantity, state, factory_id, unit_type, cap_id, inner_id')
                  .eq('product_id', data.product_id)
            : { data: [] as any[] };

        const { data: innerStockData } = data.inner_id
            ? await supabase
                  .from('inner_stock_balances')
                  .select('inner_id, quantity, factory_id')
                  .eq('inner_id', data.inner_id)
            : { data: [] as any[] };

        let salesOrderItemsForDims: any[] = [];
        if (data.sales_order_id && data.product_id) {
            const { data: soi } = await supabase
                .from('sales_order_items')
                .select('order_id, product_id, inner_id, cap_id, include_inner')
                .eq('order_id', data.sales_order_id)
                .eq('product_id', data.product_id);
            salesOrderItemsForDims = soi ?? [];
        }

        const stateMapping: Record<string, string> = {
            loose: 'semi_finished',
            packet: 'packed',
            bundle: 'finished',
            bag: 'finished',
            box: 'finished',
        };

        return this.enrichRequestWithStock(data, stockData, innerStockData, stateMapping, salesOrderItemsForDims);
    }
}

export const productionRequestService = new ProductionRequestService();
