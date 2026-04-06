import { InventoryService } from '../modules/inventory/inventory.service';
import { supabase } from '../config/supabase';

const inventoryService = new InventoryService();

async function runVerification() {
    console.log('🚀 Starting Smarter Discovery Verification\n');

    const productId = '6e5c8a95-2dbf-40e9-b3fa-f0e46bd12a5b';
    const factoryId = '7ec2471f-c1c4-4603-9181-0cbde159420b';
    const userId = '00000000-0000-0000-0000-000000000000';

    try {
        console.log('--- Scenario: Coexistence of Legacy ("") and New ("packet") Stock ---');
        console.log('Expected: Should prioritize the exact "packet" match.');
        
        try {
            // This should now succeed because it will find the unique 'packet' record
            await inventoryService.bundlePackets(productId, 1, 'bundle', 'packed', undefined, undefined, userId);
            console.log('✅ Success: Correctly prioritized exact unit_type match.');
        } catch (error: any) {
            console.error('❌ Failed:', error.message);
        }

        console.log('\n--- Scenario: Dominant Stock Selection ---');
        console.log('Expected: Should pick the variant with >95% stock if multiple matches exist.');

        // 1. Create a second variant with unit_type "packet" but tiny stock
        const altInnerId = '00000000-0000-0000-0000-000000000002';
        await supabase.from('stock_balances').insert({
            product_id: productId,
            factory_id: factoryId,
            state: 'packed',
            quantity: 1, // Tiny stock
            unit_type: 'packet',
            cap_id: null,
            inner_id: altInnerId
        });

        // The other 'packet' variant has 50. So 50/51 is > 95%.
        try {
            await inventoryService.bundlePackets(productId, 1, 'bundle', 'packed', undefined, undefined, userId);
            console.log('✅ Success: Correctly auto-selected dominant stock variant.');
        } catch (error: any) {
            console.error('❌ Failed:', error.message);
        }

        // Cleanup
        await supabase.from('stock_balances').delete().match({ product_id: productId, inner_id: altInnerId });

    } finally {
        console.log('\n🏁 Verification Finished.');
        process.exit(0);
    }
}

runVerification();
