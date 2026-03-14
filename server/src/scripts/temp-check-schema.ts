import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    const { data, error } = await supabase.rpc('get_table_columns', { p_table_name: 'production_logs' });

    if (error) {
        // Fallback if RPC doesn't exist
        const { data: colData, error: colError } = await supabase
            .from('production_logs')
            .select('*')
            .limit(1);

        if (colError) {
            console.error('Error fetching columns:', colError);
        } else {
            console.log('Columns in production_logs:', Object.keys(colData[0] || {}));
        }
    } else {
        console.log('Columns in production_logs:', data);
    }
}

checkSchema();
