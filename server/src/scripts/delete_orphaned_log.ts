import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const sql = `
DELETE FROM production_logs
WHERE machine_id = 'c2327fa0-3f59-454b-9ee7-78bde1343545'
  AND date = '2026-03-01'
  AND shift_number = 1
  AND start_time = '08:00'
  AND end_time = '20:00';
`;

async function run() {
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

    if (!connectionString) {
        console.error('❌ Missing connection string');
        process.exit(1);
    }

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const res = await client.query(sql);
        console.log(`✅ Deleted ${res.rowCount} orphaned production log entries.`);
    } catch (e: any) {
        console.error('❌ Failed to delete:', e.message);
    } finally {
        await client.end();
    }
}

run();
