import { supabase } from '../config/supabase';
import { InventoryService } from '../modules/inventory/inventory.service';
import logger from '../utils/logger';

const inventoryService = new InventoryService();

/**
 * FACTORY TRANSFER CHAIN TEST
 * 
 * Goal: Verify atomic stock transfer between factories.
 * 
 * Flow:
 * 1. Setup: Create Product, Factory A, Factory B.
 * 2. Initial Stock: Add 100 units to Factory A (Semi-finished).
 * 3. Transfer: Move 40 units from Factory A to Factory B.
 * 4. Verify:
 *    - Factory A should have 60 units.
 *    - Factory B should have 40 units.
 *    - inventory_transactions should have 'transfer_out' (-40) and 'transfer_in' (+40) records.
 */

async function runFactoryTransferTest() {
    console.log('\n--- Starting Factory Transfer Chain Test ---');

    const TEST_USER_ID = '864c7dee-f736-4e32-906c-cdd2e59f3ef4';
    const FACTORY_A_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b'; // Main
    const FACTORY_B_ID = '3e5b4b1a-0f1c-4b1a-8e57-c733e0db0751'; // Existing second factory (or create new)
    const TEST_SUFFIX = Math.random().toString(36).substring(7);

    let productId: string = '';

    try {
        // --- 1. SETUP ---
        // Create Product
        const { data: product, error: pError } = await supabase
            .from('products')
            .insert({
                name: `TRANSFER-TEST-PRODUCT-${TEST_SUFFIX}`,
                size: 'medium',
                color: 'clear',
                weight_grams: 50,
                factory_id: FACTORY_A_ID,
                status: 'active'
            })
            .select()
            .single();
        if (pError) throw pError;
        productId = product.id;
        console.log(`   ✅ Product Created: ${productId}`);

        // Set Initial Stock in Factory A
        const { error: sError } = await supabase
            .from('stock_balances')
            .insert({
                product_id: productId,
                factory_id: FACTORY_A_ID,
                state: 'semi_finished',
                quantity: 100,
                unit_type: 'packet'
            });
        if (sError) throw sError;
        console.log(`   ✅ Initial Stock: 100 units in Factory A`);

        // --- 2. EXECUTE TRANSFER ---
        console.log(`\n--- Executing Transfer: 40 units A -> B ---`);
        const result = await inventoryService.transferStock({
            productId: productId,
            fromFactoryId: FACTORY_A_ID,
            toFactoryId: FACTORY_B_ID,
            quantity: 40,
            state: 'semi_finished',
            unitType: 'packet',
            userId: TEST_USER_ID
        });

        console.log(`   ✅ RPC Success: Transfer ID ${result.transfer_id}`);

        // --- 3. VERIFY STOCK ---
        const { data: balances } = await supabase
            .from('stock_balances')
            .select('factory_id, quantity')
            .eq('product_id', productId)
            .eq('state', 'semi_finished');

        const qtyA = balances?.find(b => b.factory_id === FACTORY_A_ID)?.quantity || 0;
        const qtyB = balances?.find(b => b.factory_id === FACTORY_B_ID)?.quantity || 0;

        console.log(`   📊 Result: Factory A=${qtyA}, Factory B=${qtyB}`);
        
        if (qtyA === 60 && qtyB === 40) {
            console.log(`   🌟 SUCCESS: Stock balances updated correctly!`);
        } else {
            console.error(`   ❌ FAILURE: Stock balances mismatch! A=${qtyA} (Expected 60), B=${qtyB} (Expected 40)`);
        }

        // --- 4. VERIFY TRANSACTIONS ---
        const { data: txs } = await supabase
            .from('inventory_transactions')
            .select('transaction_type, quantity, factory_id')
            .eq('product_id', productId);

        console.log(`   📑 Audit Records Found: ${txs?.length}`);
        const hasOut = txs?.some(t => t.transaction_type === 'transfer_out' && t.quantity === -40 && t.factory_id === FACTORY_A_ID);
        const hasIn = txs?.some(t => t.transaction_type === 'transfer_in' && t.quantity === 40 && t.factory_id === FACTORY_B_ID);

        if (hasOut && hasIn) {
            console.log(`   🌟 SUCCESS: Audit logs recorded correctly!`);
        } else {
            console.error(`   ❌ FAILURE: Missing or incorrect audit logs!`);
            console.log('Found:', txs);
        }

    } catch (error) {
        console.error('💥 TEST FAILED:', error);
    } finally {
        // --- 5. CLEANUP ---
        console.log('\n--- Cleanup ---');
        if (productId) {
            await supabase.from('inventory_transactions').delete().eq('product_id', productId);
            await supabase.from('stock_balances').delete().eq('product_id', productId);
            await supabase.from('products').delete().eq('id', productId);
        }
        console.log('   ✅ Cleanup Complete');
    }
}

runFactoryTransferTest();
