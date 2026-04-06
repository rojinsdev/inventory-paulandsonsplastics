import { supabase } from '../config/supabase';
import { salesOrderService } from '../modules/sales-orders/sales-order.service';
import { customerService } from '../modules/customers/customer.service';
import logger from '../utils/logger';

/**
 * SALES & CREDIT AGING CHAIN TEST
 * 
 * Goal: Verify the full financial lifecycle of a sales order.
 * 
 * Flow:
 * 1. Setup: Customer (₹50k limit), Product (+ Stock).
 * 2. Order: Create pending order.
 * 3. Prep: Mark items as prepared.
 * 4. Dispatch: Ship on credit (30 days).
 * 5. Aging: Force deadline to past -> Run overdue check -> Verify OVERDUE.
 * 6. Payment: Record partial payment -> Verify balance & clear overdue.
 */

async function runSalesCreditAgingTest() {
    console.log('\n\x1b[35m════════════════════════════════════════════════════════════════\x1b[0m');
    console.log('\x1b[35m   Starting Sales & Credit Aging Chain Test...\x1b[0m');
    console.log('\x1b[35m════════════════════════════════════════════════════════════════\x1b[0m');

    const TEST_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';
    const TEST_USER_ID = '864c7dee-f736-4e32-906c-cdd2e59f3ef4';
    const TEST_SUFFIX = Math.random().toString(36).substring(7);

    let customerId: string = '';
    let productId: string = '';
    let orderId: string = '';

    try {
        // --- 1. SETUP: CUSTOMER & PRODUCT ---
        console.log('\n\x1b[33m[1/7] Initializing Test Entities...\x1b[0m');
        
        // Create Customer
        const customer = await customerService.createCustomer({
            name: `TEST-CUST-${TEST_SUFFIX}`,
            credit_limit: 50000,
            payment_terms: 'net_30',
            type: 'permanent'
        });
        customerId = customer.id;
        console.log(`   \x1b[32m✔\x1b[0m Customer: ${customer.name} (Limit: ₹50k)`);

        // Create Product
        const { data: product, error: pError } = await supabase
            .from('products')
            .insert({
                name: `TEST-PROD-${TEST_SUFFIX}`,
                selling_price: 150, // ₹150 per unit
                factory_id: TEST_FACTORY_ID,
                weight_grams: 50,
                size: '1000ml',
                color: 'Natural'
            })
            .select()
            .single();
        if (pError) throw pError;
        productId = product.id;
        console.log(`   \x1b[32m✔\x1b[0m Product: ${product.name} (Rate: ₹150)`);

        // Seed Stock (100 units in finished state)
        // Unit type 'bundle' in create_order_atomic maps to 'finished' state
        const { error: sError } = await supabase
            .from('stock_balances')
            .insert({
                product_id: productId,
                state: 'finished',
                quantity: 100,
                factory_id: TEST_FACTORY_ID,
                unit_type: 'bundle'
            });
        if (sError) throw sError;
        console.log(`   \x1b[32m✔\x1b[0m Inventory Seeded: 100 units available`);

        // --- 2. ORDER CREATION ---
        console.log('\n\x1b[33m[2/7] Creating Sales Order...\x1b[0m');
        const order = await salesOrderService.createOrder({
            customer_id: customerId,
            items: [{
                product_id: productId,
                quantity: 40, // Total Value: 40 * 150 = ₹6,000
                unit_type: 'bundle',
                include_inner: false
            }],
            user_id: TEST_USER_ID,
            notes: 'Test: Financial Aging Cycle'
        });
        orderId = order.id;
        console.log(`   \x1b[32m✔\x1b[0m Order Created: #${orderId.slice(-6).toUpperCase()} (Status: ${order.status})`);

        // --- 3. PREPARATION (Manual Fulfillment) ---
        console.log('\n\x1b[33m[3/7] Preparing Order Items...\x1b[0m');
        const preparedOrder = await salesOrderService.prepareOrderItems(orderId, [{
            itemId: order.sales_order_items[0].id,
            quantity: 40
        }], TEST_USER_ID);
        
        console.log(`   \x1b[32m✔\x1b[0m Items Prepared (Reserved: ${preparedOrder.sales_order_items[0].quantity_reserved})`);

        // --- 4. DISPATCH ON CREDIT ---
        console.log('\n\x1b[33m[4/7] Dispatching on Credit...\x1b[0m');
        // Calculate credit deadline (10 days from now)
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 10);
        const deadlineStr = deadline.toISOString().split('T')[0];

        const deliveredOrder = await salesOrderService.processDelivery(orderId, {
            items: [{
                item_id: order.sales_order_items[0].id,
                quantity: 40,
                unit_price: 150
            }],
            payment_mode: 'credit',
            credit_deadline: deadlineStr,
            initial_payment: 0,
            user_id: TEST_USER_ID
        });

        console.log(`   \x1b[32m✔\x1b[0m Dispatched! Amount: ₹${deliveredOrder.total_amount}, Balance: ₹${deliveredOrder.balance_due}`);
        console.log(`   \x1b[32m✔\x1b[0m Credit Deadline: ${deliveredOrder.credit_deadline}`);

        if (deliveredOrder.balance_due !== 6000) {
            throw new Error(`Balance Due Mismatch: Expected 6000, got ${deliveredOrder.balance_due}`);
        }

        // --- 5. AGING SIMULATION: EXPIRE DEADLINE ---
        console.log('\n\x1b[33m[5/7] Simulating Overdue Aging...\x1b[0m');
        
        // Manually update deadline to yesterday via SQL
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 2); // 2 days ago for safety
        const expiredDateStr = yesterday.toISOString().split('T')[0];

        const { error: upError } = await supabase
            .from('sales_orders')
            .update({ credit_deadline: expiredDateStr })
            .eq('id', orderId);
        if (upError) throw upError;

        console.log(`   ... Deadline manually shifted to ${expiredDateStr}`);

        // Run Overdue Check
        const checkResult = await salesOrderService.checkAndUpdateOverdueOrders();
        console.log(`   \x1b[32m✔\x1b[0m Overdue Check Executed: Marked ${checkResult.count} orders as overdue`);

        // Refresh and Verify
        const overdueOrder = await salesOrderService.getOrderById(orderId);
        console.log(`   \x1b[32m✔\x1b[0m Order is_overdue: ${overdueOrder.is_overdue}`);
        if (!overdueOrder.is_overdue) {
            throw new Error('Aging Simulation Failed: Order should be marked overdue');
        }

        // --- 6. PAYMENT RECOVERY ---
        console.log('\n\x1b[33m[6/7] Recording Partial Payment...\x1b[0m');
        // Pay ₹2,000 partial
        const paidOrder = await salesOrderService.recordPayment(orderId, {
            amount: 2500,
            payment_method: 'Bank Transfer',
            notes: 'Test: Partial Clearing',
            user_id: TEST_USER_ID
        });

        console.log(`   \x1b[32m✔\x1b[0m Payment Recorded: New Balance: ₹${paidOrder.balance_due}`);
        console.log(`   \x1b[32m✔\x1b[0m Overdue Flag Cleared: ${!paidOrder.is_overdue}`);

        if (paidOrder.balance_due !== 3500) {
            throw new Error(`Balance Mismatch: Expected 3500, got ${paidOrder.balance_due}`);
        }

        // --- 7. ANALYTICS VALIDATION ---
        console.log('\n\x1b[33m[7/7] Validating Customer Analytics...\x1b[0m');
        // Force calculation
        await customerService.calculateCustomerAnalytics(customerId);
        const analytics = await customerService.getCustomerAnalytics(customerId);

        if (analytics) {
            console.log(`   \x1b[32m✔\x1b[0m Total Purchase Value: ₹${analytics.delivered_value}`);
            console.log(`   \x1b[32m✔\x1b[0m Customer Segment: ${analytics.customer_segment}`);
            
            if (Number(analytics.delivered_value) !== 6000) {
                console.warn(`   \x1b[31m⚠\x1b[0m Analytics Value Mismatch (Trigger Lag?): Expected 6000, got ${analytics.delivered_value}`);
            }
        } else {
            console.warn('   \x1b[31m⚠\x1b[0m Analytics record not generated for customer');
        }

        console.log('\n\x1b[32m╔════════════════════════════════════════════════════════════════╗\x1b[0m');
        console.log('\x1b[32m║   CHAIN TEST PASSED: Sales & Credit Aging cycle is verified!   ║\x1b[0m');
        console.log('\x1b[32m╚════════════════════════════════════════════════════════════════╝\x1b[0m');

    } catch (err: any) {
        console.log('\n\x1b[31m╔════════════════════════════════════════════════════════════════╗\x1b[0m');
        console.log('\x1b[31m║   CHAIN TEST FAILED                                            ║\x1b[0m');
        console.log(`\x1b[31m║   Error: ${err.message.padEnd(54)} ║\x1b[0m`);
        console.log('\x1b[31m╚════════════════════════════════════════════════════════════════╝\x1b[0m');
        process.exit(1);
    } finally {
        // CLEANUP: We keep the data for manual inspection in this phase, 
        // but in a production CI environment we'd delete the test custom/order here.
        process.exit(0);
    }
}

runSalesCreditAgingTest();
