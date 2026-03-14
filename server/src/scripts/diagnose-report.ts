import { supabase } from '../config/supabase';

async function diagnoseReportZero() {
    console.log("--- Diagnosing Zero Revenue in Report ---");

    // 1. Fetch orders exactly how the report does
    const { data: orders, error } = await supabase
        .from('sales_orders')
        .select(`
            id,
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

    if (error) {
        console.error("Error fetching orders:", error);
        return;
    }

    console.log(`Total orders found in DB: ${orders?.length}`);

    let filteredCount = 0;
    let statusCounts: Record<string, number> = {};

    orders?.forEach(order => {
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
        
        if (order.status === 'cancelled') return;
        filteredCount++;

        console.log(`\nAnalyzing Order ${order.id.slice(-6)}:`);
        console.log(`- Status: ${order.status}`);
        console.log(`- Total Amount: ${order.total_amount} (Type: ${typeof order.total_amount})`);
        
        const items = order.sales_order_items as any[];
        console.log(`- Items Count: ${items.length}`);
        
        items.forEach((item, idx) => {
            console.log(`  Item ${idx + 1}: Qty=${item.quantity}, Price=${item.unit_price}, FactoryID=${item.products?.factory_id}`);
        });

        // Simulating the logic:
        const rawOrderTotal = items.reduce((sum: number, item: any) => sum + (item.quantity * (item.unit_price || 0)), 0);
        console.log(`- Calculated Raw Total: ${rawOrderTotal}`);
        
        if (rawOrderTotal === 0 && items.length > 0) {
            console.log(`⚠️  Warning: Raw total is 0 even though there are items! (Check quantity/unit_price types)`);
        }
    });

    console.log("\n--- Final Statistics ---");
    console.log(`Status distribution:`, statusCounts);
    console.log(`Non-cancelled orders matching filters: ${filteredCount}`);
}

diagnoseReportZero().catch(console.error);
