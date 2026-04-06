import { supabase } from '../config/supabase';
import { purchaseService } from '../modules/purchases/purchase.service';
import { inventoryService } from '../modules/inventory/inventory.service';

/**
 * 🧪 Procurement to Payment Chain Test
 * 
 * Verifies:
 * 1. Supplier Creation
 * 2. Raw Material Purchase (Credit)
 * 3. Inventory Stock Update
 * 4. Supplier Ledger (Balance Due) Increase
 * 5. Payment Recording (Partial & Full)
 * 6. Reconciliation of Balances
 */
async function runProcurementPaymentChainTest() {
    console.log('🧪 Starting Procurement to Payment Chain Test...');
    
    const TEST_FACTORY_ID = '7ec2471f-c1c4-4603-9181-0cbde159420b'; // Main Factory
    
    let userId: string | null = null;
    let supplierId: string | null = null;
    let purchaseId: string | null = null;
    let rawMaterialId: string | null = null;

    try {
        // 0. Setup: Get Real User & Data
        const { data: user } = await supabase.from('user_profiles').select('id').limit(1).single();
        if (!user) throw new Error('No user profile found');
        userId = user.id;

        // 1. Create a Test Raw Material
        const { data: rm, error: rmError } = await supabase.from('raw_materials').insert({
            name: 'TEST-PLASTIC-PTP',
            type: 'Granule',
            stock_weight_kg: 0,
            factory_id: TEST_FACTORY_ID,
            min_threshold_kg: 100
        }).select().single();
        if (rmError) throw new Error(`RM Setup failed: ${rmError.message}`);
        rawMaterialId = rm.id;
        console.log(`   ✅ Raw Material Created: ${rm.name} (${rawMaterialId})`);

        // 2. Create a Test Supplier
        const { data: supplier, error: sError } = await supabase.from('suppliers').insert({
            name: 'PTP Test Supplier',
            factory_id: TEST_FACTORY_ID,
            balance_due: 0
        }).select().single();
        if (sError) throw new Error(`Supplier Setup failed: ${sError.message}`);
        supplierId = supplier.id;
        console.log(`   ✅ Supplier Created: ${supplier.name} (${supplierId})`);

        if (!rawMaterialId || !supplierId || !userId) {
            throw new Error('Crucial IDs missing after setup');
        }

        console.log('\n--- Phase 1: Credit Purchase ---');
        // Purchase 1000kg of Raw Material at 150/kg = 150,000 total. Pay 50,000 upfront.
        const purchaseData = {
            supplier_id: supplierId as string,
            factory_id: TEST_FACTORY_ID,
            item_type: 'Raw Material' as const,
            raw_material_id: rawMaterialId as string,
            quantity: 1000,
            unit: 'kg',
            rate_per_kg: 150,
            total_amount: 150000,
            paid_amount: 50000,
            balance_due: 100000,
            description: 'PTP Chain Test Purchase',
            created_by: userId as string,
            payment_mode: 'Cash'
        };

        const purchase = await purchaseService.createPurchase(purchaseData);
        purchaseId = purchase.id;
        console.log(`   ✅ Purchase Created: ${purchaseId}`);
        console.log(`   ✅ Payment Status: ${purchase.payment_status} (Expected: partial)`);

        // Verify Stock Increase
        const { data: updatedRM } = await supabase.from('raw_materials').select('stock_weight_kg').eq('id', rawMaterialId).single();
        console.log(`   ✅ RM Stock: ${updatedRM?.stock_weight_kg}kg (Expected: 1000)`);
        if (Number(updatedRM?.stock_weight_kg) !== 1000) throw new Error('Stock update failed');

        // Verify Supplier Balance Increase
        const { data: updatedSupplier } = await supabase.from('suppliers').select('balance_due').eq('id', supplierId).single();
        console.log(`   ✅ Supplier Balance: ${updatedSupplier?.balance_due} (Expected: 100000)`);
        if (Number(updatedSupplier?.balance_due) !== 100000) throw new Error('Supplier balance update failed');

        console.log('\n--- Phase 2: Recording Additional Payment ---');
        // Record another 50,000 payment
        await purchaseService.recordPayment({
            purchase_id: purchaseId as string,
            supplier_id: supplierId as string,
            amount: 50000,
            payment_method: 'Bank Transfer',
            factory_id: TEST_FACTORY_ID,
            created_by: userId as string
        });
        console.log('   ✅ Additional 50k Payment Recorded');

        // Verify Purchase Reconciliation
        const reconciledPurchase = await purchaseService.getPurchaseById(purchaseId as string);
        console.log(`   ✅ Purchase Balance Due: ${reconciledPurchase.balance_due} (Expected: 50000)`);
        if (Number(reconciledPurchase.balance_due) !== 50000) throw new Error('Purchase reconciliation failed');

        // Verify Supplier Reconciliation
        const { data: reconciledSupplier } = await supabase.from('suppliers').select('balance_due').eq('id', supplierId as string).single();
        console.log(`   ✅ Supplier Balance Due: ${reconciledSupplier?.balance_due} (Expected: 50000)`);
        if (Number(reconciledSupplier?.balance_due) !== 50000) throw new Error('Supplier reconciliation failed');

        console.log('\n--- Phase 3: Final Settlement ---');
        // Clear remaining 50,000
        await purchaseService.recordPayment({
            purchase_id: purchaseId as string,
            supplier_id: supplierId as string,
            amount: 50000,
            payment_method: 'Cash',
            factory_id: TEST_FACTORY_ID,
            created_by: userId as string
        });
        console.log('   ✅ Final 50k Payment Recorded');

        const finalPurchase = await purchaseService.getPurchaseById(purchaseId as string);
        console.log(`   ✅ Final Purchase Status: ${finalPurchase.payment_status} (Expected: paid)`);
        if (finalPurchase.payment_status !== 'paid') throw new Error('Final status should be paid');

        const { data: finalSupplier } = await supabase.from('suppliers').select('balance_due').eq('id', supplierId as string).single();
        console.log(`   ✅ Final Supplier Balance: ${finalSupplier?.balance_due} (Expected: 0)`);
        if (Number(finalSupplier?.balance_due) !== 0) throw new Error('Final supplier balance should be 0');

        console.log('\n🌟 PROCUREMENT TO PAYMENT CHAIN TEST PASSED SUCCESSFULLY!');

    } catch (err: any) {
        console.error('\n💥 TEST FAILED!');
        console.error(err.message);
        if (err.stack) console.error(err.stack);
    } finally {
        console.log('\n--- Cleanup ---');
        if (purchaseId) {
            await supabase.from('supplier_payments').delete().eq('purchase_id', purchaseId);
            await supabase.from('purchases').delete().eq('id', purchaseId);
            console.log('   ✅ Purchase & Payments Cleaned');
        }
        if (supplierId) {
            await supabase.from('suppliers').delete().eq('id', supplierId);
            console.log('   ✅ Supplier Cleaned');
        }
        if (rawMaterialId) {
            await supabase.from('inventory_transactions').delete().eq('raw_material_id', rawMaterialId);
            await supabase.from('raw_materials').delete().eq('id', rawMaterialId);
            console.log('   ✅ Raw Material & Transactions Cleaned');
        }
    }
}

runProcurementPaymentChainTest();
