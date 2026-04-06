import { supabase } from '../config/supabase';
import { SalesOrderService } from '../modules/sales-orders/sales-order.service';
import { StockAllocationService } from '../modules/inventory/stock-allocation.service';

/**
 * 🧪 Sales Fulfillment Chain Test
 * 
 * Verifies the decoupled manual fulfillment workflow:
 * 1. Order Creation (Backordered + In-Stock)
 * 2. Production Signal (Manual Prepared Update)
 * 3. Manual Reservation (The decoupled step)
 * 4. Verification of Stock Movements
 */
async function runSalesFulfillmentChainTest() {
    console.log('🧪 Starting Sales Fulfillment Chain Test...');
    
    const TEST_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b'; // Main Factory
    const salesOrderService = new SalesOrderService();
    const stockAllocationService = new StockAllocationService();

    let userId: string | null = null;
    let customerId: string | null = null;
    let productId: string | null = null;
    let capId: string | null = null;
    let orderId: string | null = null;
    let tubItem: any = null;
    let capItem: any = null;

    try {
        // 0. Setup: Get Real User & Data
        const { data: user } = await supabase.from('user_profiles').select('id').limit(1).single();
        if (!user) throw new Error('No user profile found');
        userId = user.id;

        const { data: customerData } = await supabase.from('customers').select('id, credit_limit').limit(1).single();
        if (!customerData) throw new Error('No customer found');
        customerId = customerData.id;

        // Ensure sufficient credit limit for the test
        await supabase.from('customers').update({ credit_limit: 1000000 }).eq('id', customerId);

        // Find a Tub Product
        const { data: product } = await supabase.from('products').select('id, selling_price').eq('factory_id', TEST_FACTORY_ID).limit(1).single();
        if (!product) throw new Error('No product found for factory');
        productId = product.id;

        // Find a Cap Variant
        const { data: cap } = await supabase.from('caps').select('id').eq('factory_id', TEST_FACTORY_ID).limit(1).single();
        if (!cap) throw new Error('No cap found for factory');
        capId = cap.id;

        console.log('--- Phase 1: Stock Preparation ---');
        // Ensure Product has 0 stock (to force backorder)
        await supabase.from('stock_balances').delete().eq('product_id', productId).eq('factory_id', TEST_FACTORY_ID);
        console.log('   ✅ Product stock cleared (Forcing Backorder)');

        // Ensure Cap has 10 units stock (available)
        await supabase.from('cap_stock_balances').delete().eq('cap_id', capId).eq('factory_id', TEST_FACTORY_ID);
        await supabase.rpc('adjust_cap_stock', {
            p_cap_id: capId,
            p_quantity_change: 10,
            p_state: 'finished',
            p_factory_id: TEST_FACTORY_ID,
            p_unit_type: 'packet'
        });
        console.log('   ✅ Cap stock prepared (10 units available)');

        console.log('\n--- Phase 2: Order Creation ---');
        const orderData = {
            customer_id: customerId as string,
            items: [
                { product_id: productId as string, quantity: 10, unit_type: 'bundle' as const, unit_price: 100 }, // Backordered
                { cap_id: capId as string, quantity: 10, unit_type: 'packet' as const, unit_price: 50 }           // Available
            ],
            user_id: userId as string
        };

        const order: any = await salesOrderService.createOrder(orderData);
        orderId = order.id;
        console.log(`   ✅ Order Created: ${orderId}`);
        console.log(`   ✅ Status: ${order.status}`);

        // Verify backorder status
        const tubItem = order.sales_order_items.find((i: any) => i.product_id === productId);
        const capItem = order.sales_order_items.find((i: any) => i.cap_id === capId);
        
        console.log(`   ✅ Tub Item Backordered: ${tubItem.is_backordered}`);
        console.log(`   ✅ Cap Item Backordered: ${capItem.is_backordered}`);

        // Verify Production Request for Tub
        const { data: prodReqs } = await supabase.from('production_requests').select('*').eq('sales_order_id', orderId);
        console.log(`   ✅ Production Requests Found: ${prodReqs?.length}`);
        
        const tubRequest = prodReqs?.find(r => r.product_id === productId);
        if (!tubRequest) throw new Error('Production request for Tub not found');

        console.log('\n--- Phase 3: Production Signaling (The Signal) ---');
        // Marking production as ready, but this should NOT reserve stock automatically
        
        // Ensure some stock exists for the "prepared" signal to pass validation (simulating production happened)
        const { error: adjError } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_quantity_change: 10,
            p_state: 'finished',
            p_factory_id: TEST_FACTORY_ID,
            p_unit_type: 'bundle'
        });
        if (adjError) throw new Error(`Adjust stock failed: ${adjError.message}`);

        // Fulfill ALL requests for this order
        const { data: allReqs } = await supabase.from('production_requests').select('*').eq('sales_order_id', orderId);
        console.log(`   ✅ Fulfilling ${allReqs?.length} production requests...`);
        
        for (const req of allReqs || []) {
            console.log(`      - Request: ${req.id.slice(-6)}, Item: ${req.product_id ? 'Product' : 'Cap'}, Qty: ${req.quantity}, Factory: ${req.factory_id}`);
            await stockAllocationService.fulfillRequestManually(req.id, userId as string);
            console.log(`      - Request ${req.id.slice(-6)} marked as PREPARED`);
        }

        // Verify stock is still in 'finished' state (NOT reserved yet)
        const { data: stockPostSignal } = await supabase.from('stock_balances')
            .select('quantity, state')
            .eq('product_id', productId)
            .eq('factory_id', TEST_FACTORY_ID);
        
        const reservedStock = stockPostSignal?.filter(s => s.state === 'reserved').reduce((sum, s) => sum + s.quantity, 0) || 0;
        console.log(`   ✅ Reserved Stock after Signal: ${reservedStock} (Expected 0)`);
        if (Number(reservedStock) !== 0) throw new Error('Auto-reservation occurred! Decoupling failed.');

        console.log('\n--- Phase 4: Manual Reservation (The Action) ---');
        // This is what the PM does in the Order Prep screen
        await salesOrderService.prepareOrderItems(orderId as string, [
            { itemId: tubItem.id, quantity: 10 },
            { itemId: capItem.id, quantity: 10 }
        ], userId as string);
        console.log('   ✅ Manual Reservation Executed via prepareOrderItems API');

        // Verify Final Stock States
        const { data: finalTubStock } = await supabase.from('stock_balances').select('quantity, state').eq('product_id', productId).eq('factory_id', TEST_FACTORY_ID);
        const finalReservedTub = finalTubStock?.find(s => s.state === 'reserved')?.quantity || 0;
        console.log(`   ✅ Final Reserved Tubs: ${finalReservedTub} (Expected 10)`);

        const { data: finalCapStock } = await supabase.from('cap_stock_balances').select('quantity, state').eq('cap_id', capId).eq('factory_id', TEST_FACTORY_ID);
        const finalReservedCap = finalCapStock?.find(s => s.state === 'reserved')?.quantity || 0;
        console.log(`   ✅ Final Reserved Caps: ${finalReservedCap} (Expected 10)`);

        if (Number(finalReservedTub) !== 10 || Number(finalReservedCap) !== 10) {
            throw new Error('Manual reservation failed to update stock balances correctly');
        }

        console.log('\n--- Phase 5: Partial Dispatch (Partial Delivery) ---');
        // Let's dispatch 5 of each
        await salesOrderService.processDelivery(orderId as string, {
            items: [
                { item_id: tubItem.id, quantity: 5, unit_price: 100 },
                { item_id: capItem.id, quantity: 5, unit_price: 50 }
            ],
            payment_mode: 'cash',
            user_id: userId as string
        });
        console.log('   ✅ Partial Dispatch Executed (5 units each)');

        // Verify Order Status after partial dispatch
        const { data: orderPartial } = await supabase.from('sales_orders').select('status').eq('id', orderId).single();
        console.log(`   ✅ Order Status after Partial: ${orderPartial?.status} (Expected partially_delivered)`);
        if (orderPartial?.status !== 'partially_delivered') throw new Error('Status not partially_delivered');

        // Verify Reserved Stock reduced
        const { data: stockPostPartial } = await supabase.from('stock_balances').select('quantity, state').eq('product_id', productId).eq('factory_id', TEST_FACTORY_ID);
        const reservedTubPostPartial = stockPostPartial?.find(s => s.state === 'reserved')?.quantity || 0;
        console.log(`   ✅ Remaining Reserved Tub: ${reservedTubPostPartial} (Expected 5)`);
        if (Number(reservedTubPostPartial) !== 5) throw new Error('Partial dispatch failed to deduct correct amount from reserved stock');

        console.log('\n--- Phase 6: Final Dispatch (Full Delivery) ---');
        await salesOrderService.processDelivery(orderId as string, {
            items: [
                { item_id: tubItem.id, quantity: 5, unit_price: 100 },
                { item_id: capItem.id, quantity: 5, unit_price: 50 }
            ],
            payment_mode: 'cash',
            user_id: userId as string
        });
        console.log('   ✅ Final Dispatch Executed (Remaining 5 units each)');

        // Verify Order status is 'delivered'
        const { data: orderFinal } = await supabase.from('sales_orders').select('status').eq('id', orderId).single();
        console.log(`   ✅ Final Order Status: ${orderFinal?.status} (Expected delivered)`);
        if (orderFinal?.status !== 'delivered') throw new Error('Status not delivered');

        // Verify Reserved Stock is ZERO
        const { data: stockFinal } = await supabase.from('stock_balances').select('quantity, state').eq('product_id', productId).eq('factory_id', TEST_FACTORY_ID);
        const finalReservedTubZero = stockFinal?.find(s => s.state === 'reserved')?.quantity || 0;
        console.log(`   ✅ Final Reserved Tub: ${finalReservedTubZero} (Expected 0)`);
        if (Number(finalReservedTubZero) !== 0) throw new Error('Final dispatch failed to clear reserved stock');

        console.log('\n🌟 SALES FULFILLMENT CHAIN TEST PASSED SUCCESSFULLY!');

    } catch (err: any) {
        console.error('\n💥 TEST FAILED!');
        console.error(err.message);
        if (err.stack) console.error(err.stack);
    } finally {
        console.log('\n--- Cleanup ---');
        if (orderId) {
            await supabase.from('dispatch_items').delete().eq('sales_order_item_id', tubItem?.id);
            await supabase.from('dispatch_items').delete().eq('sales_order_item_id', capItem?.id);
            await supabase.from('dispatch_records').delete().eq('order_id', orderId);
            await supabase.from('production_requests').delete().eq('sales_order_id', orderId);
            await supabase.from('sales_order_items').delete().eq('order_id', orderId);
            await supabase.from('sales_orders').delete().eq('id', orderId);
            console.log('   ✅ Order Data Cleaned');
        }
        if (productId) await supabase.from('stock_balances').delete().eq('product_id', productId);
        if (capId) await supabase.from('cap_stock_balances').delete().eq('cap_id', capId);
        console.log('   ✅ Test Stock Cleaned');
    }
}

runSalesFulfillmentChainTest();
