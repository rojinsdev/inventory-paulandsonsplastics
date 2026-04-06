import { supabase } from '../config/supabase';
import { SalesOrderService } from '../modules/sales-orders/sales-order.service';
import logger from '../utils/logger';

const salesOrderService = new SalesOrderService();

/**
 * CUSTOMER CREDIT LIMIT CHAIN TEST
 * 
 * Goal: Verify that atomic order creation blocks if credit limit is exceeded.
 * 
 * Flow:
 * 1. Setup: Create Customer with 10k Limit.
 * 2. Order 1: Create 5k order -> SUCCESS.
 * 3. Order 2: Create 6k order -> FAILURE (Total 11k > 10k).
 * 4. Verify:
 *    - Order 1 exists.
 *    - Order 2 does NOT exist.
 *    - Error message explicitly mentions the credit limit breach.
 */

async function runCreditLimitTest() {
    console.log('\n--- Starting Customer Credit Limit Chain Test ---');

    const TEST_USER_ID = '864c7dee-f736-4e32-906c-cdd2e59f3ef4';
    const TEST_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';
    const TEST_SUFFIX = Math.random().toString(36).substring(7);

    let customerId: string = '';
    let productId: string = '';

    try {
        // --- 1. SETUP ---
        // Create Product (Price 100)
        const { data: product, error: pError } = await supabase
            .from('products')
            .insert({
                name: `CREDIT-TEST-PRODUCT-${TEST_SUFFIX}`,
                size: 'medium',
                color: 'blue',
                weight_grams: 50,
                selling_price: 100,
                factory_id: TEST_FACTORY_ID,
                status: 'active'
            })
            .select()
            .single();
        if (pError) throw pError;
        productId = product.id;
        console.log(`   ✅ Product Created (Price: 100)`);

        // Create Customer (Limit: 10,000)
        const { data: customer, error: cError } = await supabase
            .from('customers')
            .insert({
                name: `CREDIT-TEST-CUSTOMER-${TEST_SUFFIX}`,
                credit_limit: 10000,
                balance_due: 0,
                factory_id: TEST_FACTORY_ID,
                status: 'active'
            })
            .select()
            .single();
        if (cError) throw cError;
        customerId = customer.id;
        console.log(`   ✅ Customer Created (Limit: ${customer.credit_limit})`);

        // --- 2. PHASE 1: Order within limit (5,000) ---
        console.log(`\n--- Phase 1: Order within limit (50 units x 100 = 5,000) ---`);
        const order1 = await salesOrderService.createOrder({
            customer_id: customerId,
            user_id: TEST_USER_ID,
            items: [{ product_id: productId, quantity: 50, unit_price: 100, unit_type: 'bundle' }]
        });
        console.log(`   ✅ Order 1 SUCCESS: ${order1.id}`);

        // --- 3. PHASE 2: Order exceeding limit (6,000) ---
        console.log(`\n--- Phase 2: Order exceeding limit (60 units x 100 = 6,000) ---`);
        try {
            await salesOrderService.createOrder({
                customer_id: customerId,
                user_id: TEST_USER_ID,
                items: [{ product_id: productId, quantity: 60, unit_price: 100, unit_type: 'bundle' }]
            });
            console.error(`   ❌ FAILURE: Order was created despite exceeding credit limit!`);
        } catch (error: any) {
            console.log(`   ✅ SUCCESS: Order blocked as expected!`);
            console.log(`      -> Error: ${error.message}`);
            
            if (error.message.includes('exceed credit limit')) {
                console.log(`      -> Validated Error Message: ✅`);
            } else {
                console.warn(`      -> Unexpected Error Message: ${error.message}`);
            }
        }

        // --- 4. VERIFY FINAL STATE ---
        const { data: orders } = await supabase.from('sales_orders').select('id').eq('customer_id', customerId);
        console.log(`   📊 Result: ${orders?.length} orders found for customer (Expected: 1)`);
        
        const { data: finalCustomer } = await supabase.from('customers').select('balance_due').eq('id', customerId).single();
        console.log(`   💰 Final Balance Due: ${finalCustomer?.balance_due} (Expected: 5,000)`);

        if (orders?.length === 1 && Number(finalCustomer?.balance_due) === 5000) {
            console.log(`   🌟 SUCCESS: Credit limit enforcement is working perfectly!`);
        } else {
            console.error(`   ❌ FAILURE: Data inconsistency detected!`);
        }

    } catch (error) {
        console.error('💥 TEST FAILED:', error);
    } finally {
        // --- 5. CLEANUP ---
        console.log('\n--- Cleanup ---');
        if (customerId) {
            await supabase.from('sales_order_items').delete().in('order_id', (await supabase.from('sales_orders').select('id').eq('customer_id', customerId)).data?.map(o => o.id) || []);
            await supabase.from('sales_orders').delete().eq('customer_id', customerId);
            await supabase.from('customers').delete().eq('id', customerId);
        }
        if (productId) await supabase.from('products').delete().eq('id', productId);
        console.log('   ✅ Cleanup Complete');
    }
}

runCreditLimitTest();
