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
                total_amount,
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
            // NEVER count revenue or bundles for cancelled orders
            if (order.status === 'cancelled') return;

            let orderRevenue = 0;
            let orderBundles = 0;
            let hasRelevantItems = false;

            // Calculate raw total of this order for proportional discount calculation if factory filter is used
            const rawOrderTotal = order.sales_order_items.reduce((sum: number, item: any) => sum + (item.quantity * (item.unit_price || 0)), 0);

            order.sales_order_items.forEach((item: any) => {
                // Filter by factory if provided
                if (filters.factory_id && item.products?.factory_id !== filters.factory_id) {
                    return;
                }

                hasRelevantItems = true;
                const itemRawTotal = item.quantity * (item.unit_price || 0);

                // Use total_amount as the "Source of Truth" if it exists (for delivered/discounted orders).
                // If it's null (pending/reserved), use the raw total calculated from items.
                const confirmedOrderTotal = (order.total_amount !== null && order.total_amount !== undefined) 
                    ? (order.total_amount || 0) 
                    : rawOrderTotal;

                if (filters.factory_id) {
                    const factoryProportion = rawOrderTotal > 0 ? (itemRawTotal / rawOrderTotal) : 0;
                    orderRevenue += confirmedOrderTotal * factoryProportion;
                } else {
                    // We'll add the whole order total once outside the loop to avoid precision issues
                    orderRevenue = confirmedOrderTotal;
                }

                orderBundles += item.quantity;

                if (!customerStats[order.customer_id]) {
                    customerStats[order.customer_id] = { order_count: 0, total_bundles: 0 };
                }
                customerStats[order.customer_id].total_bundles += item.quantity;

                if (!productStats[item.product_id]) {
                    productStats[item.product_id] = 0;
                }
                productStats[item.product_id] += item.quantity;
            });

            if (hasRelevantItems) {
                total_orders++;
                total_bundles += orderBundles;
                total_revenue += orderRevenue;
                unique_customers.add(order.customer_id);
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
