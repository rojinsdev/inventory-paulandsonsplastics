import { supabase } from '../../config/supabase';

export class ReportsService {
    async getInventoryReport(filters: { from?: string; to?: string; factory_id?: string }) {
        // Fetch all stock balances
        let balancesQuery = supabase
            .from('stock_balances')
            .select('*');

        if (filters.factory_id) {
            balancesQuery = balancesQuery.eq('factory_id', filters.factory_id);
        }

        const { data: balances, error: balanceError } = await balancesQuery;

        if (balanceError) throw new Error(balanceError.message);

        // Fetch all products to ensure we cover all of them
        let productsQuery = supabase
            .from('products')
            .select('id, name, size');

        if (filters.factory_id) {
            productsQuery = productsQuery.eq('factory_id', filters.factory_id);
        }

        const { data: products, error: productError } = await productsQuery;

        if (productError) throw new Error(productError.message);

        // Map balances by product and state
        const productStats: Record<string, any> = {};

        products.forEach(p => {
            productStats[p.id] = {
                product_id: p.id,
                semi_finished: 0,
                packed: 0,
                finished: 0,
                reserved: 0
            };
        });

        balances?.forEach(b => {
            if (productStats[b.product_id]) {
                productStats[b.product_id][b.state] = b.quantity;
            }
        });

        const by_product = Object.values(productStats);

        // Calculate totals
        const total_items = by_product.reduce((acc, p) => acc + p.semi_finished + p.packed + p.finished + p.reserved, 0);
        const total_bundles = by_product.reduce((acc, p) => acc + p.finished + p.reserved, 0);

        // Fetch movements count (inventory transactions) in the period
        let movementsQuery = supabase.from('inventory_transactions').select('*', { count: 'exact', head: true });

        if (filters.from) movementsQuery = movementsQuery.gte('created_at', filters.from);
        if (filters.to) movementsQuery = movementsQuery.lte('created_at', filters.to);

        const { count: movements_count } = await movementsQuery;

        return {
            total_items,
            total_bundles,
            movements_count: movements_count || 0,
            by_product
        };
    }

    async getSalesReport(filters: { from?: string; to?: string; factory_id?: string }) {
        let query = supabase
            .from('sales_orders')
            .select(`
                id,
                customer_id,
                status,
                created_at,
                sales_order_items (
                    product_id,
                    quantity,
                    unit_price,
                    products (
                        factory_id
                    )
                )
            `);

        if (filters.from) query = query.gte('created_at', filters.from);
        if (filters.to) query = query.lte('created_at', filters.to);

        const { data: orders, error } = await query;
        if (error) throw new Error(error.message);

        let total_orders = 0;
        let unique_customers = new Set<string>();
        let total_bundles = 0;
        let total_revenue = 0;

        const customerStats: Record<string, { order_count: number, total_bundles: number }> = {};
        const productStats: Record<string, number> = {};

        orders.forEach(order => {
            let hasRelevantItems = false;

            order.sales_order_items.forEach((item: any) => {
                // Filter by factory if provided
                if (filters.factory_id && item.products?.factory_id !== filters.factory_id) {
                    return;
                }

                hasRelevantItems = true;
                total_bundles += item.quantity;
                total_revenue += item.quantity * (item.unit_price || 0);

                if (!customerStats[order.customer_id]) {
                    customerStats[order.customer_id] = { order_count: 0, total_bundles: 0 };
                }

                // We increment order_count for customer later to avoid double counting per order?
                // Actually, the original code incremented it here? No, original had logic outside item loop.
                // Let's handle customer stats carefully.
                customerStats[order.customer_id].total_bundles += item.quantity;

                if (!productStats[item.product_id]) {
                    productStats[item.product_id] = 0;
                }
                productStats[item.product_id] += item.quantity;
            });

            if (hasRelevantItems) {
                total_orders++;
                unique_customers.add(order.customer_id);
                // Increment order count for this customer
                if (customerStats[order.customer_id]) {
                    customerStats[order.customer_id].order_count++;
                }
            }
        });

        const top_customers = Object.entries(customerStats)
            .map(([customer_id, stats]) => ({ customer_id, ...stats }))
            .sort((a, b) => b.total_bundles - a.total_bundles);

        const top_products = Object.entries(productStats)
            .map(([product_id, quantity]) => ({ product_id, quantity }))
            .sort((a, b) => b.quantity - a.quantity);

        return {
            total_orders,
            unique_customers: unique_customers.size,
            total_bundles,
            total_revenue,
            top_customers,
            top_products
        };
    }
}

export const reportsService = new ReportsService();
