import { supabase } from '../config/supabase';

async function checkStock() {
    console.log('🔍 Checking Products with Caps...');
    const { data: products, error: pError } = await supabase
        .from('products')
        .select('id, name, cap_id')
        .not('cap_id', 'is', null)
        .limit(10);

    if (pError) {
        console.error('Error fetching products:', pError.message);
        return;
    }

    if (!products || products.length === 0) {
        console.log('No products found with caps.');
        return;
    }

    for (const p of products) {
        const { data: balances } = await supabase
            .from('stock_balances')
            .select('state, quantity, factory_id')
            .eq('product_id', p.id);

        console.log(`\nProduct: ${p.name} (Cap ID: ${p.cap_id})`);
        balances?.forEach(b => {
            console.log(` - ${b.state}: ${b.quantity} (Factory: ${b.factory_id})`);
        });

        const { data: capBalances } = await supabase
            .from('cap_stock_balances')
            .select('quantity, factory_id')
            .eq('cap_id', p.cap_id);

        capBalances?.forEach(cb => {
            console.log(`   [Cap Stock] ${cb.quantity} (Factory: ${cb.factory_id})`);
        });
    }
}

checkStock();
