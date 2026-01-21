/**
 * Run Database Migration: 010_production_system_upgrade
 * 
 * This script applies the production system upgrade migration to Supabase.
 * Run with: node database/run-migration.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    try {
        console.log('🚀 Starting migration: 010_production_system_upgrade');
        console.log('📁 Reading migration file...\n');

        const migrationPath = path.join(__dirname, 'migrations', '010_production_system_upgrade.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Split by semicolons and filter out comments and empty statements
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];

            // Skip DO blocks and COMMENT statements (they need special handling)
            if (statement.includes('DO $$') || statement.startsWith('COMMENT ON')) {
                console.log(`⏭️  Skipping statement ${i + 1} (requires direct SQL access)`);
                continue;
            }

            console.log(`⚙️  Executing statement ${i + 1}/${statements.length}...`);

            const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' });

            if (error) {
                console.error(`❌ Error in statement ${i + 1}:`, error.message);
                console.error('Statement:', statement.substring(0, 100) + '...');
                // Continue with other statements
            } else {
                console.log(`✅ Statement ${i + 1} completed`);
            }
        }

        console.log('\n✅ Migration completed!');
        console.log('\n⚠️  Note: Some statements (DO blocks, COMMENT) were skipped.');
        console.log('   Run the full migration file directly in Supabase SQL Editor for complete setup.');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runMigration();
