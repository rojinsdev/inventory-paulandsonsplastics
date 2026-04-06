import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env from root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFinalJoins() {
    console.log('Testing Core Analytics Joins...');

    // 1. Cap Cycle Time Loss Select
    const { error: capErr1 } = await supabase.from('cap_production_logs').select(`
        id,
        caps!inner(
            name, 
            color, 
            template:template_id(
                id, 
                name,
                machine_cap_templates(ideal_cycle_time_seconds, machine_id)
            )
        ),
        machine:machines(name)
    `).limit(1);

    if (capErr1) console.error('❌ Cap Cycle Time Selection Failed:', capErr1.message);
    else console.log('✅ Cap Cycle Time Selection Passed');

    // 2. Cap Weight Wastage Select
    const { error: capErr2 } = await supabase.from('cap_production_logs').select(`
        id,
        caps!inner(
            name, 
            color, 
            weight_grams:ideal_weight_grams, 
            raw_materials:raw_material_id(last_cost_per_kg)
        ),
        machine:machines(name)
    `).limit(1);

    if (capErr2) console.error('❌ Cap Weight Wastage Selection Failed:', capErr2.message);
    else console.log('✅ Cap Weight Wastage Selection Passed');

    // 3. Inner Weight Wastage Selection
    const { error: innerErr1 } = await supabase.from('inner_production_logs').select(`
        id,
        inners:inner_id(
            color,
            template:template_id(
                name,
                weight_grams:ideal_weight_grams,
                raw_materials:raw_material_id(last_cost_per_kg)
            )
        ),
        machine:machines(name)
    `).limit(1);

    if (innerErr1) console.error('❌ Inner Weight Wastage Selection Failed:', innerErr1.message);
    else console.log('✅ Inner Weight Wastage Selection Passed');
}

testFinalJoins().catch(console.error);
