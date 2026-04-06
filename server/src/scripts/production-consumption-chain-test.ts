import { supabase } from '../config/supabase';
import { ProductionService } from '../modules/production/production.service';
import logger from '../utils/logger';

const productionService = new ProductionService();

/**
 * PRODUCTION WASTAGE & RM CONSUMPTION CHAIN TEST
 * 
 * Goal: Verify that RM consumption logic correctly accounts for ideal weight + wastage.
 * 
 * Flow:
 * 1. Setup: Create Raw Material, Machine, Template, and Product.
 * 2. Set RM Stock: 100kg.
 * 3. Phase 1: Ideal Production (100 units, 50g each).
 *      - Expected RM deduction: 5kg.
 * 4. Phase 2: Wastage Production (100 units, 52g measured).
 *      - Expected RM deduction: 5.2kg.
 *      - Expected weight_wastage_kg: 0.2kg.
 * 5. Verify the Total Deduction: 10.2kg.
 */

async function runProductionChainTest() {
    console.log('\nΓöÇΓöÇΓöÇ Starting Production Wastage & RM Consumption Chain Test... ΓöÇΓöÇΓöÇ');

    const TEST_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b';
    const TEST_USER_ID = '864c7dee-f736-4e32-906c-cdd2e59f3ef4';
    const TEST_SUFFIX = Math.random().toString(36).substring(7);

    let rawMaterialId: string = '';
    let machineId: string = '';
    let templateId: string = '';
    let productId: string = '';

    try {
        // --- 1. SETUP ---
        // Create RM
        const { data: rm, error: rmError } = await supabase
            .from('raw_materials')
            .insert({
                name: `TEST-RM-${TEST_SUFFIX}`,
                type: 'plastic',
                stock_weight_kg: 100,
                factory_id: TEST_FACTORY_ID
            })
            .select()
            .single();
        if (rmError) throw rmError;
        rawMaterialId = rm.id;
        console.log(`   Γ£à Raw Material Created (${rm.stock_weight_kg}kg)`);

        // Create Machine
        const { data: machine, error: mError } = await supabase
            .from('machines')
            .insert({
                name: `TEST-MACHINE-${TEST_SUFFIX}`,
                type: 'extruder',
                status: 'active',
                category: 'small',
                factory_id: TEST_FACTORY_ID,
                daily_running_cost: 1000
            })
            .select()
            .single();
        if (mError) throw mError;
        machineId = machine.id;
        console.log(`   Γ£à Machine Created`);

        // Create Product Template
        const { data: template, error: tError } = await supabase
            .from('product_templates')
            .insert({
                name: `TEST-TEMPLATE-${TEST_SUFFIX}`,
                size: 'medium',
                weight_grams: 50,
                factory_id: TEST_FACTORY_ID
            })
            .select()
            .single();
        if (tError) throw tError;
        templateId = template.id;

        // Create Product
        const { data: product, error: pError } = await supabase
            .from('products')
            .insert({
                name: `TEST-PRODUCT-${TEST_SUFFIX}`,
                size: 'medium',
                color: 'blue',
                raw_material_id: rawMaterialId,
                template_id: templateId,
                weight_grams: 50,
                factory_id: TEST_FACTORY_ID,
                status: 'active',
                counting_method: 'unit_count'
            })
            .select()
            .single();
        if (pError) throw pError;
        productId = product.id;

        // Link Product Template to Machine
        const { error: mpError } = await supabase
            .from('machine_products')
            .insert({
                machine_id: machineId,
                product_template_id: templateId,
                ideal_cycle_time_seconds: 10
            });
        if (mpError) throw mpError;

        console.log('   Γ£à Product & Template Created & Mapped (Ideal Weight: 50g)');

        // --- 2. Phase 1: Ideal Production ---
        console.log('\n--- Phase 1: Ideal Production (100 units, 50g) ---');
        const res1 = await productionService.submitProduction({
            machine_id: machineId,
            product_id: productId,
            shift_number: 1,
            start_time: '08:00:00',
            end_time: '08:16:40',
            total_produced: 100,
            user_id: TEST_USER_ID,
            date: new Date().toISOString().split('T')[0]
        });

        const log1 = res1 as any;
        console.log(`   * Recorded RM Consumption: ${log1.total_weight_kg}kg`);

        // Verify RM Stock after Phase 1
        const { data: rm1 } = await supabase.from('raw_materials').select('stock_weight_kg').eq('id', rawMaterialId).single();
        const consumed1 = 100 - (rm1?.stock_weight_kg || 0);
        console.log(`   Γ£à Phase 1 RM Stock Deduction: ${consumed1.toFixed(2)}kg (Expected: 5.00kg)`);
        
        if (Math.abs(consumed1 - 5) > 0.01) {
            console.warn(`   ΓÜá∩╕Å WRONG RM DEDUCTION in Phase 1!`);
        }

        // --- 3. Phase 2: Wastage Production ---
        console.log('\n--- Phase 2: Wastage Production (100 units, 52g measured) ---');
        
        const res2 = await productionService.submitProduction({
            machine_id: machineId,
            product_id: productId,
            shift_number: 1,
            start_time: '09:00:00',
            end_time: '09:16:40',
            total_produced: 100,
            actual_weight_grams: 52, // 2g wastage per unit -> 200g total wastage
            user_id: TEST_USER_ID,
            date: new Date().toISOString().split('T')[0]
        });

        const log2 = res2 as any;
        console.log(`   * Recorded Wastage in Log: ${log2.weight_wastage_kg}kg`);
        console.log(`   * Total RM Consumed in Log: ${log2.total_weight_kg}kg`);

        // Verify RM Stock after Phase 2
        const { data: rm2 } = await supabase.from('raw_materials').select('stock_weight_kg').eq('id', rawMaterialId).single();
        const totalConsumed = 100 - (rm2?.stock_weight_kg || 0);
        const phase2Consumed = totalConsumed - consumed1;
        
        console.log(`   Γ£à Phase 2 RM Stock Deduction: ${phase2Consumed.toFixed(2)}kg`);
        console.log(`   * Expected with Wastage: 5.20kg`);

        if (Math.abs(phase2Consumed - 5.2) < 0.01) {
            console.log(`   ≡ƒîƒ SUCCESS: RM deduction correctly includes wastage!`);
        } else if (Math.abs(phase2Consumed - 5.0) < 0.01) {
            console.error(`   Γ¥î ISSUE: BUG PERSISTS. RM deduction only used IDEAL weight.`);
        } else {
            console.error(`   Γ¥î UNEXPECTED DEDUCTION: ${phase2Consumed.toFixed(2)}kg`);
        }

    } catch (error) {
        console.error('≡ƒ¥╡ TEST FAILED:', error);
    } finally {
        // --- 4. CLEANUP ---
        console.log('\n--- Cleanup ---');
        if (productId) {
            await supabase.from('inventory_transactions').delete().eq('product_id', productId);
            await supabase.from('stock_balances').delete().eq('product_id', productId);
            await supabase.from('production_logs').delete().eq('product_id', productId);
            await supabase.from('products').delete().eq('id', productId);
        }
        if (templateId) {
            await supabase.from('machine_products').delete().eq('product_template_id', templateId);
            await supabase.from('product_templates').delete().eq('id', templateId);
        }
        if (machineId) await supabase.from('machines').delete().eq('id', machineId);
        if (rawMaterialId) {
             await supabase.from('inventory_transactions').delete().eq('raw_material_id', rawMaterialId);
             await supabase.from('raw_materials').delete().eq('id', rawMaterialId);
        }
        console.log('   Γ£à Cleanup Complete');
    }
}

runProductionChainTest();
