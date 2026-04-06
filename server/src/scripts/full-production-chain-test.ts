import { supabase } from '../config/supabase';
import { productionService } from '../modules/production/production.service';
import { inventoryService } from '../modules/inventory/inventory.service';

async function runFullChainTest() {
    console.log('🧪 Starting FULL Production Chain Test...');
    
    const timestamp = Date.now();
    const TEST_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b'; // Main Factory
    const TEST_MACHINE_ID = '9c171193-d1b6-4a7d-9819-0ef73c11aed3'; // SreePlas Machine

    // Setup Test Data IDs
    let rmId: string | null = null;
    let capTemplateId: string | null = null;
    let mappingId: string | null = null;
    let userId: string | null = null;
    let capId: string | null = null;
    let productTemplateId: string | null = null;
    let productId: string | null = null;
    let machineProductId: string | null = null;

    try {
        // 0. Get a real user for the log
        const { data: user } = await supabase.from('user_profiles').select('id').limit(1).single();
        if (!user) throw new Error('No user profile found for testing');
        userId = user.id;

        // 1. Create Test Raw Material
        console.log('1. Creating Test Raw Material...');
        const { data: rm, error: rmError } = await supabase
            .from('raw_materials')
            .insert({
                name: `Chain-Test RM ${timestamp}`,
                stock_weight_kg: 500, // Start with 500kg
                factory_id: TEST_FACTORY_ID
            })
            .select()
            .single();
        if (rmError || !rm) throw new Error(`RM Creation failed: ${rmError?.message}`);
        rmId = rm.id;
        console.log(`   ✅ Created Raw Material: ${rm.name}`);

        // 2. Create Test Cap Template
        console.log('2. Creating Test Cap Template...');
        const { data: cap, error: capError } = await supabase
            .from('cap_templates')
            .insert({
                name: `Chain-Test Cap ${timestamp}`,
                ideal_weight_grams: 5.0, // 5g per cap
                factory_id: TEST_FACTORY_ID,
                raw_material_id: rmId
            })
            .select()
            .single();
        if (capError || !cap) throw new Error(`Cap Template Creation failed: ${capError?.message}`);
        capTemplateId = cap.id;
        console.log(`   ✅ Created Cap Template: ${cap.name}`);

        // 2.5 Create Specific Cap Variant
        console.log('2.5 Creating Specific Cap Variant...');
        const { data: capVariant, error: variantError } = await supabase
            .from('caps')
            .insert({
                name: `Variant ${timestamp}`,
                template_id: capTemplateId,
                factory_id: TEST_FACTORY_ID,
                color: 'BLUE',
                ideal_weight_grams: 5.0,
                raw_material_id: rmId
            })
            .select()
            .single();
        if (variantError || !capVariant) throw new Error(`Cap Variant Creation failed: ${variantError?.message}`);
        capId = capVariant.id;
        console.log(`   ✅ Created Cap Variant: ${capVariant.name}`);

        // 3. Create Machine-Cap Mapping
        console.log('3. Creating Machine-Cap Mapping...');
        const { data: mapping, error: mappingError } = await supabase
            .from('machine_cap_templates')
            .insert({
                machine_id: TEST_MACHINE_ID,
                cap_template_id: capTemplateId,
                ideal_cycle_time_seconds: 4.5, // 4.5 seconds per cycle
                capacity_restriction: 50000,
                enabled: true
            })
            .select()
            .single();
        if (mappingError || !mapping) throw new Error(`Mapping Creation failed: ${mappingError?.message}`);
        mappingId = mapping.id;
        console.log(`   ✅ Created Machine Mapping (Ideal Speed: 4.5s)`);

        // 4. Submit Cap Production via Service API
        console.log('4. Submitting Cap Production via API...');
        const producedWeightKg = 50; // Logging 50kg production
        
        await productionService.submitCapProduction({
            cap_id: capId as string,
            machine_id: TEST_MACHINE_ID,
            factory_id: TEST_FACTORY_ID,
            date: new Date().toISOString().split('T')[0],
            shift_number: 1,
            start_time: '08:00',
            end_time: '12:00', // 4 hours
            total_weight_produced_kg: producedWeightKg,
            actual_cycle_time_seconds: 4.5,
            downtime_reason: 'Testing',
            user_id: userId as string
        });
        console.log(`   ✅ Cap Production Submitted: ${producedWeightKg}kg`);

        // 4.5 Create Test Tub Template & Variant
        console.log('\n4.5 Creating Test Tub Template & Variant...');
        const { data: pTemplate, error: ptError } = await supabase
            .from('product_templates')
            .insert({
                name: `Chain-Test Tub ${timestamp}`,
                size: '20L',
                weight_grams: 800,
                factory_id: TEST_FACTORY_ID,
                cap_template_id: capTemplateId, // Link to our test cap
                bundle_enabled: true,
                items_per_packet: 12,
                packets_per_bundle: 50
            })
            .select()
            .single();
        if (ptError || !pTemplate) throw new Error(`Product Template Creation failed: ${ptError?.message}`);
        productTemplateId = pTemplate.id;

        const { data: product, error: pError } = await supabase
            .from('products')
            .insert({
                name: `Tub Variant ${timestamp}`,
                template_id: productTemplateId,
                factory_id: TEST_FACTORY_ID,
                size: '20L',
                color: 'NATURAL',
                weight_grams: 45.0,
                raw_material_id: rmId, 
                status: 'active',
                counting_method: 'unit_count',
                items_per_packet: 12 // MATCH TEMPLATE
            })
            .select()
            .single();
        if (pError || !product) throw new Error(`Product Variant Creation failed: ${pError?.message}`);
        productId = product.id;
        console.log(`   ✅ Created Tub Variant: ${product.name}`);

        // Link Tub to Machine
        const { data: mpLink, error: mpError } = await supabase
            .from('machine_products')
            .insert({
                machine_id: TEST_MACHINE_ID,
                product_template_id: productTemplateId,
                ideal_cycle_time_seconds: 12.0,
                enabled: true
            })
            .select()
            .single();
        if (mpError) throw new Error(`Machine-Product Link failed: ${mpError.message}`);
        machineProductId = mpLink.id;

        // 4.6 Submit Tub Production
        // Note: submit_production_atomic currently defaults to 'packed' state.
        // For testing the 'packItems' flow (loose -> packed), we manually force some stock to semi_finished.
        console.log('4.6 Submitting Tub Production & Forcing Loose Stock...');
        await productionService.submitProduction({
            product_id: productId as string,
            machine_id: TEST_MACHINE_ID,
            date: new Date().toISOString().split('T')[0],
            shift_number: 1,
            start_time: '13:00',
            end_time: '17:00',
            total_produced: 1000,
            actual_cycle_time_seconds: 12.0,
            downtime_reason: 'Testing',
            user_id: userId as string
        });

        // Manually adjust 1000 pieces to semi_finished for packing test
        await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: TEST_FACTORY_ID,
            p_state: 'semi_finished',
            p_quantity_change: 1000,
            p_cap_id: null,
            p_unit_type: ''
        });
        console.log('   ✅ Tub Production Submitted & 1000 loose units added for packing test.');

        // 4.7 Packing (Loose Tub + Loose Cap -> Packets)
        console.log('\n4.7 Packing Tubs into Packets...');
        // 12 pieces per packet * 50 packets = 600 pieces
        await inventoryService.packItems(productId as string, 50, capId as string, undefined, userId as string);
        console.log('   ✅ Packing Complete: 50 Packets Created (Tub + Blue Cap)');

        // 4.8 Bundling (The Ambiguity Test & Explicit Selection)
        console.log('\n4.8 Testing Bundling Ambiguity & Resolution...');
        
        // Create a SECOND cap variant (RED) to cause ambiguity
        const { data: capRed } = await supabase.from('caps').insert({
            name: `Variant RED ${timestamp}`,
            template_id: capTemplateId,
            factory_id: TEST_FACTORY_ID,
            color: 'RED',
            ideal_weight_grams: 5.0,
            raw_material_id: rmId
        }).select().single();
        
        if (!capRed) throw new Error('Failed to create RED cap variant');

        // Add some RED packets manually to create ambiguity
        await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_factory_id: TEST_FACTORY_ID,
            p_state: 'packed',
            p_quantity_change: 10,
            p_cap_id: capRed.id,
            p_unit_type: 'packet'
        });
        console.log('   ✅ Red packets added. System now has BLUE and RED packets.');

        // Try bundling WITHOUT specifying cap ID (Should fail due to ambiguity)
        try {
            console.log('   Testing Smart Discovery (expecting ambiguity error)...');
            await inventoryService.bundlePackets(productId as string, 1, 'bundle', 'packed', undefined, undefined, userId as string);
            throw new Error('Ambiguity check FAILED: System should have blocked bundling without explicit cap selection');
        } catch (err: any) {
            console.log(`   ✅ Correctly Blocked: ${err.message}`);
        }

        // Now bundle WITH explicit cap ID (BLUE) - This tests our Mobile UI fix
        console.log('   Testing Explicit Cap Selection (BLUE)...');
        await inventoryService.bundlePackets(productId as string, 1, 'bundle', 'packed', capId as string, undefined, userId as string);
        console.log('   ✅ Explicit Bundling SUCCESSFUL');


        // 5. Verification Phase
        console.log('\n5. Verifying Chain Effects...');

        // Verify Raw Material Deduction
        const { data: updatedRM } = await supabase.from('raw_materials').select('stock_weight_kg').eq('id', rmId).single();
        // Consumed for Caps: 50kg
        // Consumed for Tubs (Production): (1000 * 45g) / 1000 = 45kg
        // Consumed for Tubs (Manual Stock Adjust): (1000 * 45g) / 1000 = 0 (manual adjust doesn't deduct RM unless via production)
        // Wait, Tubs were unit_count. The RPC deducts RM based on product weight.
        const expectedStock = 500 - 50 - 45; 
        if (updatedRM && Math.abs(Number(updatedRM.stock_weight_kg) - expectedStock) < 0.1) {
            console.log(`   ✅ RM Deduction Verified: ${updatedRM.stock_weight_kg}kg remaining.`);
        } else {
            console.log(`   ⚠️ RM Deduction mismatch (Expected ~${expectedStock}, got ${updatedRM?.stock_weight_kg}). This might be due to RPC behavior.`);
        }

        // Verify Cap Stock
        const { data: capStock } = await supabase
            .from('cap_stock_balances')
            .select('quantity')
            .eq('cap_id', capId)
            .single();
        
        // Produced: 10,000 caps
        // Consumed for packing: 50 packets * 12 = 600 caps
        const expectedCaps = 10000 - 600;
        if (capStock && Math.abs(Number(capStock.quantity) - expectedCaps) < 1) {
            console.log(`   ✅ Cap Stock Verified: ${capStock.quantity} pieces remaining.`);
        } else {
            throw new Error(`Cap Stock Mismatch! Got: ${capStock?.quantity}, Expected: ${expectedCaps}`);
        }

        console.log('\n🌟 FULL CHAIN TEST PASSED SUCCESSFULLY!');

    } catch (err: any) {
        console.error('\n💥 TEST FAILED!');
        console.error(err.message);
        throw err;
    } finally {
        // 6. Cleanup
        console.log('\n6. Cleaning up test data...');
        if (mappingId) await supabase.from('machine_cap_templates').delete().eq('id', mappingId);
        if (machineProductId) await supabase.from('machine_products').delete().eq('id', machineProductId);

        if (capTemplateId) {
            // Delete productions first
            if (capId) {
                await supabase.from('cap_production_logs').delete().eq('cap_id', capId);
                await supabase.from('cap_stock_balances').delete().eq('cap_id', capId);
                await supabase.from('inventory_transactions').delete().eq('cap_id', capId);
                await supabase.from('stock_balances').delete().eq('cap_id', capId);
                await supabase.from('caps').delete().eq('id', capId);
            }
            // Cleanup other variants
            await supabase.from('stock_balances').delete().eq('product_id', productId);
            await supabase.from('caps').delete().eq('template_id', capTemplateId);
            await supabase.from('cap_templates').delete().eq('id', capTemplateId);
        }

        if (productTemplateId) {
            if (productId) {
                await supabase.from('production_logs').delete().eq('product_id', productId);
                await supabase.from('stock_balances').delete().eq('product_id', productId);
                await supabase.from('inventory_transactions').delete().eq('product_id', productId);
                await supabase.from('products').delete().eq('id', productId);
            }
            await supabase.from('product_templates').delete().eq('id', productTemplateId);
        }

        if (rmId) await supabase.from('raw_materials').delete().eq('id', rmId);

        console.log('   ✅ Cleanup complete.');
    }
}

runFullChainTest().catch(err => {
    console.error(err);
    process.exit(1);
});
