import { supabase } from '../config/supabase';

async function finalRevenueCheck() {
    const { data: orders, error } = await supabase
        .from('sales_orders')
        .select(`
            id,
            status,
            total_amount,
            sales_order_items (
                quantity,
                unit_price
            )
        `);

    if (error) {
        console.error(error);
        return;
    }

    let reportTotal = 0;
    let deliveredTotal = 0;
    let pendingReservedTotal = 0;

    orders?.forEach(order => {
        if (order.status === 'cancelled') return;

        const rawSum = order.sales_order_items.reduce((acc: number, item: any) => acc + (item.quantity * (item.unit_price || 0)), 0);
        const confirmedTotal = (order.total_amount !== null && order.total_amount !== undefined) 
            ? order.total_amount 
            : rawSum;

        reportTotal += confirmedTotal;
        
        if (order.status === 'delivered') {
            deliveredTotal += confirmedTotal;
        } else {
            pendingReservedTotal += confirmedTotal;
        }
    });

    console.log("FINAL_REVENUE_METRICS");
    console.log(`TOTAL_REVENUE: ${reportTotal}`);
    console.log(`DELIVERED_REVENUE: ${deliveredTotal}`);
    console.log(`PENDING_RESERVED_REVENUE: ${pendingReservedTotal}`);
}

finalRevenueCheck().catch(console.error);
