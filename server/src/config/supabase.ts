import { createClient } from '@supabase/supabase-js';
import { config } from './env';

if (!config.supabase.url || !config.supabase.key) {
    throw new Error('Missing Supabase credentials in .env');
}

// Use service role key for server-side operations (bypasses RLS)
// This is safe because this code only runs on the backend
export const supabase = createClient(
    config.supabase.url,
    config.supabase.key,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);
