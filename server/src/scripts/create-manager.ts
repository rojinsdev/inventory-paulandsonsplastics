import { supabase } from '../config/supabase';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from root of server
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function createManager() {
    const email = 'manager@paulandsons.com';
    const password = 'password123';
    const role = 'production_manager';

    console.log(`Creating user ${email}...`);

    // 1. Create Auth User
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Production Manager' }
    });

    if (authError) {
        console.error('Error creating auth user:', authError.message);
        // If user already exists, we might want to just update profile or skip
        return;
    }

    if (!authData.user) {
        console.error('No user returned');
        return;
    }

    console.log('Auth user created:', authData.user.id);

    // 2. Create Profile
    const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert({
            id: authData.user.id,
            email,
            role,
            active: true,
        });

    if (profileError) {
        console.error('Error creating profile:', profileError.message);
        // Clean up if it was a new user
        // await supabase.auth.admin.deleteUser(authData.user.id);
    } else {
        console.log('✅ Production Manager created successfully!');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
    }
}

createManager();
