import { supabase } from '../config/supabase';
import { purchaseService } from '../modules/purchases/purchase.service';
import { salesOrderService } from '../modules/sales-orders/sales-order.service';
import { initEventHandlers } from '../modules/events';
import { SystemEvents } from '../core/events';
import logger from '../utils/logger';

// Initialize Handlers
initEventHandlers();

const TEST_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b'; // Paul&Sons-Dev Main Factory

async function runFinancialIntegrityChainTest() {
    console.log('\n🧪 Starting Financial Integrity & Cash Flow Chain Test...');
    
    let userId: string | undefined;
    let customerId: string | undefined;
    let supplierId: string | undefined;
    let rawMaterialId: string | undefined;
    let productId: string | undefined;
    let purchaseId: string | undefined;
    let orderId: string | undefined;

    try {
        // 0. Setup
        const { data: userData } = await supabase.from('user_profiles').select('id').limit(1).single();
        userId = userData?.id;
        if (!userId) throw new Error('No user found for testing');

        // Create Raw Material
        const { data: rm } = await supabase.from('raw_materials').insert({
            name: 'FIN-TEST-RM-' + Date.now(),
            stock_weight_kg: 0,
            min_threshold_kg: 10,
            type: 'Granule',
            factory_id: TEST_FACTORY_ID
        }).select().single();
        if (!rm) throw new Error('Raw material creation failed');
        rawMaterialId = rm.id;

        // Create Supplier
        const { data: supplier } = await supabase.from('suppliers').insert({
            name: 'FIN-TEST-Supplier-' + Date.now(),
            factory_id: TEST_FACTORY_ID
        }).select().single();
        if (!supplier) throw new Error('Supplier creation failed');
        supplierId = supplier.id;

        // Create Product
        const { data: product } = await supabase.from('products').insert({
            name: 'FIN-TEST-Product-' + Date.now(),
            size: '1kg',
            color: 'White',
            weight_grams: 2.2,
            selling_price: 200,
            factory_id: TEST_FACTORY_ID,
            status: 'active',
            counting_method: 'unit_count',
            items_per_bundle: 600,
            bundle_enabled: true
        }).select().single();
        if (!product) throw new Error('Product creation failed');
        productId = product.id;

        // Create Customer
        const { data: customer } = await supabase.from('customers').insert({
            name: 'FIN-TEST-Customer-' + Date.now(),
            type: 'permanent',
            is_active: true
        }).select().single();
        if (!customer) throw new Error('Customer creation failed');
        customerId = customer.id;

        console.log('   ✅ Setup Complete');

        // --- Phase 1: Purchase with Initial Payment ---
        console.log('\n--- Phase 1: Purchase w/ Initial Payment ---');
        const purchase = await purchaseService.createPurchase({
            supplier_id: supplierId as string,
            item_type: 'Raw Material',
            raw_material_id: rawMaterialId as string,
            quantity: 500,
            rate_per_kg: 100,
            total_amount: 50000,
            paid_amount: 20000, // Partial payment
            balance_due: 30000,
            payment_mode: 'Cash',
            factory_id: TEST_FACTORY_ID,
            created_by: userId as string
        });
        purchaseId = purchase.id;
        console.log('   ✅ Purchase Created (Paid 20k)');

        // Wait a small bit for event handler to finish (async)
        await new Promise(r => setTimeout(r, 1000));

        // Verify Cash Flow Entry
        const { data: purchaseLog } = await supabase
            .from('cash_flow_logs')
            .select('*, cash_flow_categories(name)')
            .eq('reference_id', purchaseId)
            .eq('amount', 20000)
            .single();
        
        if (!purchaseLog) throw new Error('Cash flow log missing for initial purchase payment');
        console.log(`   ✅ Cash Flow Log found: ${purchaseLog.amount} (${(purchaseLog.cash_flow_categories as any).name})`);

        // --- Phase 2: Record Supplier Payment ---
        console.log('\n--- Phase 2: Separate Supplier Payment ---');
        const payment = await purchaseService.recordPayment({
            purchase_id: purchaseId as string,
            supplier_id: supplierId as string,
            amount: 10000,
            payment_method: 'Cash',
            factory_id: TEST_FACTORY_ID,
            created_by: userId as string
        });
        console.log('   ✅ Supplier Payment Recorded (10k)');

        await new Promise(r => setTimeout(r, 1000));

        // Verify Cash Flow Entry
        const { data: supplierPaymentLog } = await supabase
            .from('cash_flow_logs')
            .select('*, cash_flow_categories(name)')
            .eq('reference_id', payment.id)
            .eq('amount', 10000)
            .single();

        if (!supplierPaymentLog) throw new Error('Cash flow log missing for supplier payment');
        console.log(`   ✅ Cash Flow Log found: ${supplierPaymentLog.amount} (${(supplierPaymentLog.cash_flow_categories as any).name})`);

        // --- Phase 3: Sales Dispatch w/ Initial Payment ---
        console.log('\n--- Phase 3: Sales Dispatch w/ Initial Payment ---');
        
        // 3a. Add stock (to allow dispatch without backorder)
        await supabase.rpc('adjust_stock', {
            p_product_id: productId as string,
            p_factory_id: TEST_FACTORY_ID,
            p_state: 'finished',
            p_quantity_change: 100,
            p_unit_type: 'bundle'
        });

        // 3b. Create Sales Order
        const order = await salesOrderService.createOrder({
            customer_id: customerId as string,
            user_id: userId as string,
            items: [{ product_id: productId as string, quantity: 100, unit_type: 'bundle', unit_price: 200 }]
        });
        orderId = order.id;

        // 3c. Prepare Order
        const orderItem = order?.sales_order_items?.[0];
        if (!orderItem) throw new Error('Failed to create sales order item');
        await salesOrderService.prepareOrderItems(orderId as string, [{ itemId: orderItem.id, quantity: 100 }], userId as string);

        // 3d. Process Delivery with 5k payment
        const dispatchResult = await salesOrderService.processDelivery(orderId as string, {
            items: [{ item_id: orderItem.id, quantity: 100, unit_price: 200 }],
            payment_mode: 'credit',
            initial_payment: 5000,
            payment_method: 'Cash',
            user_id: userId as string
        });
        console.log('   ✅ Sales Dispatch Processed (Paid 5k)');

        await new Promise(r => setTimeout(r, 1000));

        // Verify Cash Flow Entry
        // Fetch the last payment created for this order
        const { data: lastSalesPayment } = await supabase
            .from('payments')
            .select('id')
            .eq('sales_order_id', orderId as string)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (!lastSalesPayment) throw new Error('Payment record missing from database after dispatch');
        const paymentIdFromDispatch = lastSalesPayment.id;

        const { data: dispatchPaymentLog } = await supabase
            .from('cash_flow_logs')
            .select('*, cash_flow_categories(name)')
            .eq('reference_id', paymentIdFromDispatch)
            .eq('amount', 5000)
            .single();

        if (!dispatchPaymentLog) throw new Error('Cash flow log missing for dispatch initial payment');
        console.log(`   ✅ Cash Flow Log found: ${dispatchPaymentLog.amount} (${(dispatchPaymentLog.cash_flow_categories as any).name})`);

        // --- Phase 4: Record Customer Payment ---
        console.log('\n--- Phase 4: Separate Customer Payment ---');
        const customerPayment = await salesOrderService.recordPayment(orderId as string, {
            amount: 2000,
            payment_method: 'Cash',
            user_id: userId as string
        });
        console.log('   ✅ Customer Payment Recorded (2k)');

        await new Promise(r => setTimeout(r, 1000));

        // Verify Cash Flow Entry
        // Find payment ID for this record
        const { data: lastPayment } = await supabase
            .from('payments')
            .select('id')
            .eq('sales_order_id', orderId)
            .eq('amount', 2000)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        const { data: customerPaymentLog } = await supabase
            .from('cash_flow_logs')
            .select('*, cash_flow_categories(name)')
            .eq('reference_id', lastPayment?.id)
            .eq('amount', 2000)
            .single();

        if (!customerPaymentLog) throw new Error('Cash flow log missing for customer payment');
        console.log(`   ✅ Cash Flow Log found: ${customerPaymentLog.amount} (${(customerPaymentLog.cash_flow_categories as any).name})`);

        console.log('\n🌟 FINANCIAL INTEGRITY CHAIN TEST PASSED SUCCESSFULLY!');

    } catch (error: any) {
        console.error('\n💥 TEST FAILED!');
        console.error(error.message);
        if (error.stack) console.error(error.stack);
    } finally {
        console.log('\n--- Cleanup ---');
        if (purchaseId) {
            await supabase.from('supplier_payments').delete().eq('purchase_id', purchaseId);
            await supabase.from('cash_flow_logs').delete().eq('reference_id', purchaseId);
            await supabase.from('purchases').delete().eq('id', purchaseId);
            console.log('   ✅ Purchase & Logs Cleaned');
        }
        if (orderId) {
            const { data: dp } = await supabase.from('dispatch_records').select('id').eq('order_id', orderId);
            const dpIds = dp?.map(d => d.id) || [];
            if (dpIds.length) await supabase.from('dispatch_items').delete().in('dispatch_id', dpIds);
            await supabase.from('dispatch_records').delete().eq('order_id', orderId);
            await supabase.from('payments').delete().eq('sales_order_id', orderId);
            await supabase.from('cash_flow_logs').delete().filter('notes', 'ilike', `%${orderId}%`); // Fallback cleanup
            await supabase.from('sales_order_items').delete().eq('order_id', orderId);
            await supabase.from('sales_orders').delete().eq('id', orderId);
            console.log('   ✅ Sales & Logs Cleaned');
        }
        if (supplierId) await supabase.from('suppliers').delete().eq('id', supplierId);
        if (customerId) await supabase.from('customers').delete().eq('id', customerId);
        if (productId) {
            await supabase.from('stock_balances').delete().eq('product_id', productId);
            await supabase.from('products').delete().eq('id', productId);
        }
        if (rawMaterialId) {
            await supabase.from('raw_material_transactions').delete().eq('raw_material_id', rawMaterialId);
            await supabase.from('raw_materials').delete().eq('id', rawMaterialId);
        }
        console.log('   ✅ Core Entities Cleaned');
    }
}

runFinancialIntegrityChainTest();
