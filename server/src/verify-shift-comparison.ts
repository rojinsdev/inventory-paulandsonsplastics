import { analyticsService } from './modules/analytics/analytics.service';
import { supabase } from './config/supabase';

async function verify() {
    console.log('🚀 Starting Analytics Verification...');

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const filters = {
        start_date: '2026-04-04',
        end_date: tomorrow
    };

    try {
        console.log('\n--- Testing getShiftComparison ---');
        const shiftStats = await analyticsService.getShiftComparison(filters);
        console.log('✅ getShiftComparison successful!');
        console.log('Shift 1:', JSON.stringify(shiftStats.shift_1, null, 2));
        console.log('Shift 2:', JSON.stringify(shiftStats.shift_2, null, 2));

        console.log('\n--- Testing getWeightWastageReport ---');
        const wastageReport = await analyticsService.getWeightWastageReport(filters);
        console.log('✅ getWeightWastageReport successful!');
        console.log('Total Wastage (KG):', wastageReport.total_wastage_kg);
        console.log('Sample Sessions Count:', wastageReport.sessions.length);

        console.log('\n--- Testing getDashboardSummary ---');
        const summary = await analyticsService.getDashboardSummary(filters);
        console.log('✅ getDashboardSummary successful!');
        console.log('Total Production:', summary.total_production);
        console.log('Total Wastage (KG):', summary.total_weight_wastage_kg);

        console.log('\n✨ ALL TESTS PASSED!');
    } catch (error) {
        console.error('❌ Verification failed:', error);
        process.exit(1);
    }
}

verify();
