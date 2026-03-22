import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.development specifically
dotenv.config({ path: path.join(__dirname, '../../.env.development') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL or SUPABASE_KEY missing in .env.development');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createAdminUser() {
  const email = 'rojins.dev@gmail.com';
  const password = 'rojins@123';

  console.log(`🚀 Creating admin user: ${email}...`);

  // 1. Create User in Auth
  let authUser;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'admin', full_name: 'Rojins Dev' }
  });

  if (authError) {
    if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
      console.log('ℹ️ User already exists in Auth. Fetching existing user...');
      const { data: listData } = await supabase.auth.admin.listUsers();
      authUser = listData?.users.find(u => u.email === email);
    } else {
      console.error('❌ Auth Error:', authError.message);
      return;
    }
  } else {
    console.log('✅ User created in Auth.');
    authUser = authData?.user;
  }

  // 2. Link to user_profiles table
  if (authUser?.id) {
     const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({ 
        id: authUser.id, 
        email, 
        role: 'admin',
        name: 'Rojins Dev' 
      });

    if (profileError) {
      console.error('❌ Profile Error:', profileError.message);
    } else {
      console.log('✅ Admin profile created in user_profiles.');
    }
  }

  console.log('🎉 Done!');
}

createAdminUser();
