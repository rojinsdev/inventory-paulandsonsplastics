import { inventoryService } from '../modules/inventory/inventory.service';
import { supabase } from '../config/supabase';

async function verifyUnpackFix() {
    console.log('🚀 Starting Verification: Cap Return on Unpack');

    try {
        // 1. Setup: Find a product and a cap
        const { data: products } = await supabase.from('products').select('id, factory_id').limit(1);
        const { data: caps } = await supabase.from('caps').select('id').limit(1);

        if (!products || !caps || products.length === 0 || caps.length === 0) {
            console.error('❌ Setup failed: Could not find a product or cap.');
            return;
        }

        const productId = products[0].id;
        const factoryId = products[0].factory_id || '7ec2471f-c1c4-4603-9181-0cbde159420b';
        const capId = caps[0].id;

        console.log(`Using Product: ${productId}, Cap: ${capId} at Factory: ${factoryId}`);

        // Update product to use this cap for testing
        await supabase.from('products').update({ cap_id: capId }).eq('id', productId);

        // Ensure we have some loose stock and cap stock
        await supabase.from('stock_balances').upsert({
            product_id: productId,
            state: 'semi_finished',
            factory_id: factoryId,
            quantity: 1000
        }, { onConflict: 'product_id,state,factory_id' });

        await supabase.from('cap_stock_balances').upsert({
            cap_id: capId,
            factory_id: factoryId,
            quantity: 1000
        }, { onConflict: 'cap_id,factory_id' });

        // 2. Initial State Check
        console.log('--- Initial State ---');
        const { data: initialCapStock } = await supabase.from('cap_stock_balances').select('quantity').eq('cap_id', capId).eq('factory_id', factoryId).single();
        console.log(`Cap Stock: ${initialCapStock?.quantity}`);

        // 3. Perform Packing (Deducts caps)
        console.log('\n📦 Packing 10 packets (120 items)...');
        // Pack: Semi-Finished -> Packed
        await inventoryService.packItems(productId, 10, capId);

        const { data: afterPackCapStock } = await supabase.from('cap_stock_balances').select('quantity').eq('cap_id', capId).eq('factory_id', factoryId).single();
        console.log(`Cap Stock after Pack: ${afterPackCapStock?.quantity} (Should be 880)`);

        if (afterPackCapStock?.quantity !== 880) {
            console.error('❌ Error: Packing did not deduct correct amount of caps.');
        }

        // 4. Perform Unpack (Should return caps)
        console.log('\n🔓 Unpacking 10 packets back to loose...');
        // Unpack: Packed -> Semi-Finished
        await inventoryService.unpack(productId, 10, 'packed', 'semi_finished');

        const { data: finalCapStock } = await supabase.from('cap_stock_balances').select('quantity').eq('cap_id', capId).eq('factory_id', factoryId).single();
        console.log(`Cap Stock after Unpack: ${finalCapStock?.quantity} (Should be 1000)`);

        if (finalCapStock?.quantity === initialCapStock?.quantity) {
            console.log('\n✅ Verification SUCCESS: Caps were returned to inventory correctly!');
        } else {
            console.error('\n❌ Verification FAILED: Caps were NOT returned correctly.');
        }

    } catch (error: any) {
        console.error('❌ Error during verification:', error.message);
    }
}

verifyUnpackFix();
