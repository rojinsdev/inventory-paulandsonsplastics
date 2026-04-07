
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/server/.env.development') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
    console.log('Testing query for Inner Template...');
    const id = '217eb444-dfd9-4986-948d-81c64d111a41';
    
    const { data, error } = await supabase
        .from('inner_templates')
        .select(`
            *,
            variants:inners(
                *,
                stock:inner_stock_balances(quantity)
            ),
            mapped_tub_templates:product_templates(id, name)
        `)
        .eq('id', id)
        .single();

    if (error) {
        console.error('ERROR:', error);
    } else {
        console.log('SUCCESS:', data);
    }
}

testQuery();
