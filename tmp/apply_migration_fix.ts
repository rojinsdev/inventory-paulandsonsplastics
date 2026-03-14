import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../server/.env') });

const sql = `
ALTER TABLE cap_production_logs 
ADD COLUMN IF NOT EXISTS actual_weight_grams NUMERIC;

COMMENT ON COLUMN cap_production_logs.actual_weight_grams IS 'The measured weight per unit in grams for this production session';

-- Force schema cache reload
NOTIFY pgrst, 'reload schema';
`;

async function run() {
    const client = new Client({
        connectionString: process.env.DIRECT_URL,
    });

    try {
        await client.connect();
        console.log('Connected to database.');
        await client.query(sql);
        console.log('Migration applied successfully.');
    } catch (err) {
        console.error('Error applying migration:', err);
    } finally {
        await client.end();
    }
}

run();
