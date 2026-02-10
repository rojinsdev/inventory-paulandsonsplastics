
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Checking production_logs table for factory_id column...');

    // Try to select factory_id from one row
    const { data, error } = await supabase
        .from('production_logs')
        .select('factory_id')
        .limit(1);

    if (error) {
        console.error('Error selecting factory_id:', error.message);
        console.log('Migration 013 might not have applied.');
    } else {
        console.log('Success! factory_id column exists.');
    }
}

checkSchema();
