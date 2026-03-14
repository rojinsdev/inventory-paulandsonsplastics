import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DIRECT_URL || "postgresql://postgres.gncbejlrycumifdhucqr:paul%26sons%40123@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";

async function run() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        const sql = fs.readFileSync(path.join(__dirname, '../../../database/migrations/046_create_user_push_tokens.sql'), 'utf8');
        await client.query(sql);
        console.log('Migration applied successfully');
    } catch (err) {
        console.error('Error applying migration:', err);
    } finally {
        await client.end();
    }
}

run();
