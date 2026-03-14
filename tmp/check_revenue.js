const { Client } = require('pg');

const connectionString = "postgresql://postgres.gncbejlrycumifdhucqr:paul%26sons%40123@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";

async function analyzeRevenue() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        
        console.log("--- Analyzing Sales Data ---");

        // 1. Check a few orders and their item totals vs order total_amount
        const query = `
            SELECT 
                so.id, 
                so.status, 
                so.total_amount as order_total_recorded,
                so.discount_value,
                so.discount_type,
                SUM(sai.quantity * sai.unit_price) as items_sum_raw
            FROM sales_orders so
            JOIN sales_order_items sai ON so.id = sai.order_id
            GROUP BY so.id, so.status, so.total_amount, so.discount_value, so.discount_type
            LIMIT 10;
        `;
        
        const res = await client.query(query);
        console.log("Sample Orders Analysis:");
        res.rows.forEach(row => {
            console.log(`Order ${row.id.slice(-6)}:`);
            console.log(`  Status: ${row.status}`);
            console.log(`  Items Raw Sum: ${row.items_sum_raw}`);
            console.log(`  Discount: ${row.discount_value} (${row.discount_type})`);
            console.log(`  Total Recorded: ${row.order_total_recorded}`);
            const expectedAfterDiscount = row.discount_type === 'percentage' 
                ? row.items_sum_raw * (1 - row.discount_value/100)
                : (row.items_sum_raw - (row.discount_value || 0));
            console.log(`  Calculated Expected: ${expectedAfterDiscount}`);
            console.log('---');
        });

        // 2. Check totals by status
        const summaryQuery = `
            SELECT 
                status, 
                COUNT(*) as order_count,
                SUM(total_amount) as total_recorded,
                SUM((SELECT SUM(quantity * unit_price) FROM sales_order_items WHERE order_id = sales_orders.id)) as raw_items_sum
            FROM sales_orders
            GROUP BY status;
        `;
        const summaryRes = await client.query(summaryQuery);
        console.log("\nSummary by Status:");
        summaryRes.rows.forEach(row => {
            console.log(`Status: ${row.status}`);
            console.log(`  Count: ${row.order_count}`);
            console.log(`  Raw Sum (no discount, all types): ${row.raw_items_sum}`);
            console.log(`  Final Recorded Revenue: ${row.total_recorded}`);
            console.log('---');
        });

    } catch (err) {
        console.error('Error querying database:', err);
    } finally {
        await client.end();
    }
}

analyzeRevenue();
