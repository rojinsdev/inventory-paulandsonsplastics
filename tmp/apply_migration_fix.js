const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Explicitly load .env from the server directory
const envPath = path.resolve(__dirname, '../server/.env');
dotenv.config({ path: envPath });

console.log('Using database URL:', process.env.DIRECT_URL ? 'FOUND' : 'NOT FOUND');

const sql = `
ALTER TABLE cap_production_logs 
ADD COLUMN IF NOT EXISTS actual_weight_grams NUMERIC;

COMMENT ON COLUMN cap_production_logs.actual_weight_grams IS 'The measured weight per unit in grams for this production session';

-- Force schema cache reload
NOTIFY pgrst, 'reload schema';
`;

async function run() {
    if (!process.env.DIRECT_URL) {
        console.error('Error: DIRECT_URL not found in .env');
        process.exit(1);
    }

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
