
import { supabase } from '../config/supabase';
import { config } from '../config/env';

async function checkKey() {
    console.log('Supabase URL:', config.supabase.url);
    console.log('Supabase Key First 10 chars:', config.supabase.key.substring(0, 10));

    // Check if we can bypass RLS by trying to select from a protected table without a session
    try {
        const { data, error } = await supabase.from('sales_orders').select('count', { count: 'exact', head: true });
        if (error) {
            console.error('API Error:', error.message);
        } else {
            console.log('Successfully accessed sales_orders. Count:', data);
            console.log('RLS Bypass appears to be WORKING.');
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

checkKey();
