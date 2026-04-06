import { supabase } from '../config/supabase';
import { productionService } from '../modules/production/production.service';

async function runTest() {
    console.log('🧪 Starting Cap Raw Material Deduction Test...');

    const timestamp = Date.now();
    const TEST_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b'; // Main Factory

    // Fetch a real user
    const { data: user, error: userError } = await supabase
        .from('user_profiles') // Assuming user_profiles is the public table
        .select('id')
        .limit(1)
        .single();

    if (userError || !user) throw new Error('No test user found');
    const TEST_USER_ID = user.id;
    console.log(`   Γ£à Using Test User ID: ${TEST_USER_ID}`);

    // 1. Create Test Raw Material
    console.log('1. Creating Test Raw Material...');
    const { data: rm, error: rmError } = await supabase
        .from('raw_materials')
        .insert({
            name: `Test RM ${timestamp}`,
            stock_weight_kg: 100, // Initial stock
            factory_id: TEST_FACTORY_ID
        })
        .select()
        .single();

    if (rmError || !rm) throw new Error(`RM Creation failed: ${rmError?.message}`);
    console.log(`   ✅ Created RM: ${rm.name} (ID: ${rm.id}) with 100kg`);

    // 2. Create Test Cap linked to RM
    console.log('2. Creating Test Cap...');
    const { data: cap, error: capError } = await supabase
        .from('caps')
        .insert({
            name: `Test Cap ${timestamp}`,
            ideal_weight_grams: 2.5,
            ideal_cycle_time_seconds: 5,
            factory_id: TEST_FACTORY_ID,
            raw_material_id: rm.id
        })
        .select()
        .single();

    if (capError || !cap) {
        // Cleanup RM if cap fails
        await supabase.from('raw_materials').delete().eq('id', rm.id);
        throw new Error(`Cap Creation failed: ${capError?.message}`);
    }
    console.log(`   ✅ Created Cap: ${cap.name} (ID: ${cap.id}) linked to RM`);

    try {
        // 3. Submit Production
        console.log('3. Submitting Cap Production...');
        const producedWeightKg = 10; // 10kg produced

        await productionService.submitCapProduction({
            cap_id: cap.id,
            machine_id: '9c171193-d1b6-4a7d-9819-0ef73c11aed3',
            factory_id: TEST_FACTORY_ID,
            date: new Date().toISOString().split('T')[0],
            shift_number: 1,
            start_time: '08:00',
            end_time: '09:00',
            total_weight_produced_kg: producedWeightKg,
            actual_cycle_time_seconds: 5,
            user_id: TEST_USER_ID
        });
        console.log(`   ✅ Submitted production of ${producedWeightKg}kg`);

        // 4. Verify Deduction
        console.log('4. Verifying Deduction...');
        const { data: updatedRM } = await supabase
            .from('raw_materials')
            .select('stock_weight_kg')
            .eq('id', rm.id)
            .single();

        if (!updatedRM) throw new Error('Failed to fetch updated RM');

        const expectedStock = 100 - producedWeightKg; // 90kg

        if (Math.abs(updatedRM.stock_weight_kg - expectedStock) < 0.001) {
            console.log(`   ✅ SUCCESS: Stock is ${updatedRM.stock_weight_kg}kg (Expected: ${expectedStock}kg)`);
        } else {
            console.error(`   ❌ FAILED: Stock is ${updatedRM.stock_weight_kg}kg (Expected: ${expectedStock}kg)`);
        }

    } catch (e) {
        console.error('   ❌ Test Execution Failed:', e);
    } finally {
        // 5. Cleanup
        console.log('5. Cleaning up...');
        await supabase.from('cap_production_logs').delete().eq('cap_id', cap.id);
        await supabase.from('cap_stock_balances').delete().eq('cap_id', cap.id); // Also clean stock
        await supabase.from('caps').delete().eq('id', cap.id);
        await supabase.from('raw_materials').delete().eq('id', rm.id);
        console.log('   ✅ Cleanup complete.');
    }
}

runTest();
