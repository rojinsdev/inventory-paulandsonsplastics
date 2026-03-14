import { supabase } from '../config/supabase';

async function listPolicies() {
    const { data: policies, error } = await supabase
        .from('pg_policies')
        .select('*')
        .eq('tablename', 'raw_materials');

    if (error) {
        // pg_policies is usually not exposed to anon/service role directly unless specially configured
        console.error('Error fetching policies:', error);
        return;
    }

    if (!policies || policies.length === 0) {
        console.log('No policies found or access denied (expected for system catalogs).');
        // Try listing raw_materials with a user token if possible, but we don't have one easily here.
        // Instead, let's look at migrations directory.
        return;
    }

    console.log('Policies for raw_materials:', policies);
}

listPolicies();
