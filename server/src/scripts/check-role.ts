import { supabase } from '../config/supabase';

async function checkUserRole() {
    const email = 'rojin@paulandsons.com';
    // First get auth user to find ID (or just query user_profiles if email is there)
    // Assuming user_profiles has email, or linked via auth.users

    // We'll try to find by email in user_profiles if it exists there, 
    // otherwise we might need to join with auth.users which we can't do easily via client 
    // without service role. 

    // Let's just list all profiles and see.
    const { data: profiles, error } = await supabase
        .from('user_profiles')
        .select('*');

    if (error) {
        console.error(error);
        return;
    }

    console.log('User Profiles:', profiles);
}

checkUserRole();
