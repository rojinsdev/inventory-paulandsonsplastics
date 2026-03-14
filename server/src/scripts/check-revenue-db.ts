import { supabase } from '../config/supabase';

async function testRevenue() {
    console.log("--- Analyzing Sales Revenue Calculation ---");

    // 1. Fetch orders from the last month
    const { data: orders, error } = await supabase
        .from('sales_orders')
        .select(`
            id,
            status,
            total_amount,
            subtotal,
            discount_value,
            discount_type,
            sales_order_items (
                quantity,
                unit_price
            )
        `)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching orders:", error);
        return;
    }

    orders?.forEach(order => {
        const rawSum = order.sales_order_items.reduce((acc: number, item: any) => acc + (item.quantity * item.unit_price), 0);
        
        console.log(`Order ID: ${order.id.slice(-6)}`);
        console.log(`- Status: ${order.status}`);
        console.log(`- Raw Items Sum: ${rawSum}`);
        console.log(`- Subtotal Recorded: ${order.subtotal}`);
        console.log(`- Discount: ${order.discount_value} (${order.discount_type})`);
        console.log(`- Total Amount (Final): ${order.total_amount}`);
        
        // Simulating the current (incorrect) report logic
        const reportLogicValue = rawSum; 
        console.log(`- VALUE SHOWING IN REPORT (RAW): ${reportLogicValue}`);
        
        if (Math.abs(reportLogicValue - (order.total_amount || 0)) > 1) {
            console.log(`❌ DISCREPANCY DETECTED! Difference: ${reportLogicValue - (order.total_amount || 0)}`);
            if (order.status === 'cancelled') {
                console.log(`Reason: This is a CANCELLED order, but report counts it!`);
            } else if (order.discount_value) {
                console.log(`Reason: Discount was applied but IGNORED by report logic!`);
            }
        } else {
            console.log(`✅ MATCHES (No discounts or cancellations)`);
        }
        console.log("------------------------------------------");
    });
}

testRevenue().catch(console.error);
