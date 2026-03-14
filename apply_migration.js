const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = "postgresql://postgres.gncbejlrycumifdhucqr:paul%26sons%40123@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";

async function run() {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        const sql = fs.readFileSync(path.join(__dirname, 'server/migrations/20260226_atomic_stock.sql'), 'utf8');
        await client.query(sql);
        console.log('Migration applied successfully');
    } catch (err) {
        console.error('Error applying migration:', err);
    } finally {
        await client.end();
    }
}

run();
