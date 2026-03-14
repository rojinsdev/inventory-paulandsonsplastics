import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function applyMigration() {
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

    if (!connectionString) {
        console.error('❌ DIRECT_URL or DATABASE_URL is missing in .env');
        process.exit(1);
    }

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔌 Connecting to database...');
        await client.connect();
        console.log('✅ Connected.');

        const migrationPath = path.join(__dirname, '../../../database/migrations/022_template_variant_architecture.sql');
        console.log(`\n📄 Processing migration 022...`);

        const sql = fs.readFileSync(migrationPath, 'utf8');
        await client.query(sql);
        console.log(`✅ Successfully applied migration 022`);

    } catch (err: any) {
        console.error('❌ Error applying migration:');
        console.error(err.message);
    } finally {
        await client.end();
    }
}

applyMigration();
