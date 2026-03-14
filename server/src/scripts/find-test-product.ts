import { supabase } from '../config/supabase';

async function findTestProduct() {
    console.log('🔍 Finding test product...');
    const { data: results, error } = await supabase
        .from('products')
        .select(`
            id, 
            name, 
            cap_id,
            stock_balances(state, quantity, factory_id)
        `)
        .not('cap_id', 'is', null);

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    const candidates = results.filter(p =>
        p.stock_balances && p.stock_balances.some(b => (b.state === 'finished' || b.state === 'packed') && b.quantity > 0)
    );

    if (candidates.length === 0) {
        console.log('No products found with caps and stock. Showing all products with caps:');
        results.slice(0, 5).forEach(p => console.log(`- ${p.name} (ID: ${p.id}, Cap: ${p.cap_id})`));
        return;
    }

    for (const p of candidates) {
        console.log(`\n✅ Found Candidate: ${p.name} (ID: ${p.id})`);
        console.log(`   Cap ID: ${p.cap_id}`);
        p.stock_balances.forEach(b => {
            console.log(`   - ${b.state}: ${b.quantity} (Factory: ${b.factory_id})`);
        });

        const { data: capStock } = await supabase
            .from('cap_stock_balances')
            .select('quantity, factory_id')
            .eq('cap_id', p.cap_id);

        capStock?.forEach(cs => {
            console.log(`   [Cap Stock] ${cs.quantity} (Factory: ${cs.factory_id})`);
        });
    }
}

findTestProduct();
