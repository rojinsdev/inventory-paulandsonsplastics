import { supabase } from '../config/supabase';

async function debugCaps() {
    console.log('🔍 Debugging Caps and Balances...');

    const { data: caps, error: cError } = await supabase.from('caps').select('*');
    if (cError) {
        console.error('Error fetching caps:', cError.message);
    } else {
        console.log(`Found ${caps?.length} caps.`);
    }

    const { data: balances, error: bError } = await supabase.from('cap_stock_balances').select('*, caps(name)');
    if (bError) {
        console.error('Error fetching balances:', bError.message);
    } else {
        console.log(`Found ${balances?.length} cap stock balances.`);
        balances?.forEach(b => {
            console.log(`- Cap: ${b.caps?.name} (${b.cap_id}), Factory: ${b.factory_id}, Qty: ${b.quantity}`);
        });
    }

    const { data: factories } = await supabase.from('factories').select('id, name');
    console.log('\nAvailable Factories:');
    factories?.forEach(f => console.log(`- ${f.name}: ${f.id}`));
}

debugCaps();
