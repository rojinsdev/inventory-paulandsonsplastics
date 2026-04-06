import { supabase } from '../config/supabase';
import { productionService } from '../modules/production/production.service';

async function runTest() {
    console.log('🧪 Starting Cap Manual Count Logic Test...');

    const timestamp = Date.now();
    const TEST_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b'; // Main Factory

    // Fetch a real user
    const { data: user, error: userError } = await supabase
        .from('user_profiles')
        .select('id')
        .limit(1)
        .single();

    if (userError || !user) throw new Error('No test user found');
    const TEST_USER_ID = user.id;

    // 1. Setup: Create Raw Material and Cap
    const { data: rm } = await supabase.from('raw_materials').insert({
        name: `Test RM Multi ${timestamp}`,
        stock_weight_kg: 1000,
        factory_id: TEST_FACTORY_ID
    }).select().single();

    const { data: cap } = await supabase.from('caps').insert({
        name: `Test Cap Multi ${timestamp}`,
        ideal_weight_grams: 2.5,
        ideal_cycle_time_seconds: 5,
        factory_id: TEST_FACTORY_ID,
        raw_material_id: rm!.id
    }).select().single();

    console.log(`   ✅ Setup complete. Cap Ideal Weight: 2.5g`);

    try {
        // TEST 1: Weight-only Mode (Legacy)
        console.log('\n--- TEST 1: Weight-only Mode ---');
        const res1 = await productionService.submitCapProduction({
            cap_id: cap!.id,
            machine_id: '9c171193-d1b6-4a7d-9819-0ef73c11aed3',
            factory_id: TEST_FACTORY_ID,
            date: new Date().toISOString().split('T')[0],
            shift_number: 1,
            start_time: '08:00',
            end_time: '09:00',
            total_weight_produced_kg: 10, // 10kg
            actual_cycle_time_seconds: 5,
            user_id: TEST_USER_ID
        });
        console.log(`   Unit Count: ${res1.calculated_quantity} (Expected: 4000)`);
        console.log(`   Weight Deducted: ${res1.total_weight_produced_kg}kg (Expected: 10)`);

        // TEST 2: Unit-only Mode (Option B)
        console.log('\n--- TEST 2: Unit-only Mode (Option B) ---');
        const res2 = await productionService.submitCapProduction({
            cap_id: cap!.id,
            machine_id: '9c171193-d1b6-4a7d-9819-0ef73c11aed3',
            factory_id: TEST_FACTORY_ID,
            date: new Date().toISOString().split('T')[0],
            shift_number: 1,
            start_time: '09:00',
            end_time: '10:00',
            total_produced: 2000, // 2000 units
            actual_cycle_time_seconds: 5,
            user_id: TEST_USER_ID
        });
        console.log(`   Unit Count: ${res2.calculated_quantity} (Expected: 2000)`);
        console.log(`   Weight Deducted: ${res2.total_weight_produced_kg}kg (Expected: 5.0)`);

        // TEST 3: Mixed Mode (Most Accurate)
        console.log('\n--- TEST 3: Mixed Mode ---');
        const res3 = await productionService.submitCapProduction({
            cap_id: cap!.id,
            machine_id: '9c171193-d1b6-4a7d-9819-0ef73c11aed3',
            factory_id: TEST_FACTORY_ID,
            date: new Date().toISOString().split('T')[0],
            shift_number: 1,
            start_time: '10:00',
            end_time: '11:00',
            total_produced: 1000,
            total_weight_produced_kg: 3, // 1000 units but 3kg plastic used (heavy caps)
            actual_cycle_time_seconds: 5,
            user_id: TEST_USER_ID
        });
        console.log(`   Unit Count: ${res3.calculated_quantity} (Expected: 1000)`);
        console.log(`   Weight Deducted: ${res3.total_weight_produced_kg}kg (Expected: 3)`);

    } catch (e) {
        console.error('   ❌ Test Failed:', e);
    } finally {
        console.log('\nCleaning up...');
        await supabase.from('cap_production_logs').delete().eq('cap_id', cap!.id);
        await supabase.from('cap_stock_balances').delete().eq('cap_id', cap!.id);
        await supabase.from('caps').delete().eq('id', cap!.id);
        await supabase.from('raw_materials').delete().eq('id', rm!.id);
        console.log('   ✅ Done.');
    }
}

runTest();
