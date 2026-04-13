import { supabase } from '../config/supabase';
import { productionService } from '../modules/production/production.service';
import { inventoryService } from '../modules/inventory/inventory.service';
import { config } from '../config/env';

async function runFullChainTest() {
    console.log('🧪 Starting FULL Production Chain Test (LIVE DATA)...');

    // IDs from Production DB
    const TEST_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b'; // Main Factory
    const TEST_MACHINE_ID = '2c4ee539-1830-42b3-abe6-f270cd607a00'; // sree plast small
    const TEST_PRODUCT_ID = '77925ca0-cbc5-493b-a21d-40bc01d1a8a4'; // 25 ML NEW JAR
    const TEST_CAP_ID = 'f5334c50-c5c4-44d4-a11c-304548eb3781';    // 25ML CAP
    const TEST_INNER_ID = '15f92998-dd2f-4576-9fdc-90bcdeb56aa9';  // 50ML INNER variant
    const TEST_USER_ID = '9e45952d-2388-4088-adce-247b62613bf9';    // Rojins
    const TEST_RM_ID = 'eb04c39a-48ac-4a27-b8cf-c6e7e52832aa';      // HM (Raw Material)

    let productionLogId: string | null = null;
    let capLogId: string | null = null;
    let innerLogId: string | null = null;
    let tempMappingId: string | null = null;

    try {
        console.log(`🧪 Supabase URL: ${config.supabase.url}`);
        console.log(`🧪 Searching for Product ID: ${TEST_PRODUCT_ID}`);
        console.log('1. Verifying Environment...');
        const { data: product, error: pError } = await supabase.from('products').select('name, template_id').eq('id', TEST_PRODUCT_ID).single();
        if (pError) {
            console.error(`   ❌ Supabase Error: ${pError.message} (URL: ${config.supabase.url})`, pError);
            throw new Error(`Test Product not found in ${config.nodeEnv}: ${pError.message}`);
        }
        if (!product) throw new Error('Test Product data is null');
        console.log(`   ✅ Using Product: ${product.name}`);

        const testDate = '2025-01-01';

        // 1.5 Create Temporary Mapping for Cap (since production DB is missing it)
        console.log('1.5 Creating Temporary Machine-Cap Mapping...');
        const { data: capData } = await supabase.from('caps').select('template_id').eq('id', TEST_CAP_ID).single();
        const { data: mapData, error: mapError } = await supabase.from('machine_cap_templates').insert({
            machine_id: TEST_MACHINE_ID,
            cap_template_id: capData?.template_id,
            ideal_cycle_time_seconds: 4.5,
            cavity_count: 8,
            enabled: true
        }).select().single();

        if (mapError) {
            console.warn(`   ⚠️ Mapping creation failed or already exists: ${mapError.message}`);
        } else {
            tempMappingId = mapData.id;
            console.log(`   ✅ Temporary Mapping Created: ${tempMappingId}`);
        }

        // 2. Submit Tub Production
        console.log('2. Submitting Tub Production...');
        const res = await productionService.submitProduction({
            product_id: TEST_PRODUCT_ID,
            machine_id: TEST_MACHINE_ID,
            date: testDate,
            shift_number: 1,
            start_time: '08:00',
            end_time: '12:00',
            total_produced: 8000,
            actual_cycle_time_seconds: 12.0,
            downtime_reason: 'Testing',
            user_id: TEST_USER_ID
        });
        productionLogId = res.id;
        console.log(`   ✅ Tub Production Log Created: ${productionLogId}`);

        // 3. Submit Cap Production
        console.log('3. Submitting Cap Production...');
        const capRes = await productionService.submitCapProduction({
            cap_id: TEST_CAP_ID,
            machine_id: TEST_MACHINE_ID,
            factory_id: TEST_FACTORY_ID,
            date: testDate,
            shift_number: 1,
            start_time: '08:00',
            end_time: '12:00',
            total_weight_produced_kg: 5, // 5kg
            actual_cycle_time_seconds: 4.5,
            downtime_reason: 'Testing',
            user_id: TEST_USER_ID
        });
        capLogId = capRes.id;
        console.log(`   ✅ Cap Production Log Created: ${capLogId}`);

        // 4. Submit Inner Production
        console.log('4. Submitting Inner Production...');
        const innerRes = await productionService.submitInnerProduction({
            inner_id: TEST_INNER_ID,
            machine_id: TEST_MACHINE_ID,
            factory_id: TEST_FACTORY_ID,
            date: testDate,
            shift_number: 1,
            start_time: '08:00',
            end_time: '12:00',
            total_weight_produced_kg: 2, // 2kg
            actual_cycle_time_seconds: 3.2,
            downtime_reason: 'Testing',
            user_id: TEST_USER_ID
        });
        innerLogId = innerRes.id;
        console.log(`   ✅ Inner Production Log Created: ${innerLogId}`);

        // 5. Packing Test
        console.log('5. Testing Packing Logic (Loose -> Packet)...');
        await inventoryService.packItems(TEST_PRODUCT_ID, 50, TEST_CAP_ID, TEST_INNER_ID, TEST_USER_ID);
        console.log('   ✅ Packing Success: Created 50 Packets of 25 ML NEW JAR');

        // 6. Bundling Test
        console.log('6. Testing Bundling Logic (Packet -> Bundle)...');
        await inventoryService.bundlePackets(TEST_PRODUCT_ID, 1, 'bundle', 'packed', TEST_CAP_ID, TEST_INNER_ID, TEST_USER_ID);
        console.log('   ✅ Bundling Success: Created 1 Bundle');

        console.log('\n🌟 LIVE CHAIN TEST PASSED SUCCESSFULLY!');

    } catch (err: any) {
        console.error('\n💥 TEST FAILED!');
        console.error(err.message);
        throw err;
    } finally {
        console.log('\n7. Cleaning up (UNDO STOCK CHANGES)...');
        // We DELETE the transaction logs and logs we created
        if (productionLogId) await supabase.from('production_logs').delete().eq('id', productionLogId);
        if (capLogId) await supabase.from('cap_production_logs').delete().eq('id', capLogId);
        if (innerLogId) await supabase.from('inner_production_logs').delete().eq('id', innerLogId);
        if (tempMappingId) await supabase.from('machine_cap_templates').delete().eq('id', tempMappingId);

        // Clean up inventory transactions created today for this product by this user
        // Note: In production we should be careful, but here we only delete what was created in the last few minutes
        await supabase.from('inventory_transactions').delete()
            .eq('product_id', TEST_PRODUCT_ID)
            .eq('created_by', TEST_USER_ID)
            .gte('created_at', new Date(Date.now() - 5 * 60000).toISOString());

        // ADJUST STOCK BACK (Manual correction)
        // This is a safety measure to ensure stock balances aren't permanently inflated by the test
        await supabase.rpc('adjust_stock', { p_product_id: TEST_PRODUCT_ID, p_factory_id: TEST_FACTORY_ID, p_state: 'finished', p_quantity_change: -1, p_cap_id: TEST_CAP_ID, p_unit_type: 'bundle' });
        await supabase.rpc('adjust_stock', { p_product_id: TEST_PRODUCT_ID, p_factory_id: TEST_FACTORY_ID, p_state: 'packed', p_quantity_change: -12, p_cap_id: TEST_CAP_ID, p_unit_type: 'unit' });
        // Restore RM (Relative correction)
        await supabase.rpc('adjust_raw_material_stock', { p_material_id: TEST_RM_ID, p_weight_change: 7 });

        console.log('   ✅ Stock adjustments and logs reverted (mostly).');
    }
}

runFullChainTest().catch(err => {
    console.error(err);
    process.exit(1);
});
