import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

async function applyMigration() {
    const client = new Client({
        connectionString: process.env.DIRECT_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        console.log('Connected to database.');

        const query = `
      ALTER TABLE cap_production_logs ADD COLUMN IF NOT EXISTS total_produced INTEGER;
      COMMENT ON COLUMN cap_production_logs.total_produced IS 'Manual unit count entered by user. If null, use calculated_quantity.';
    `;

        await client.query(query);
        console.log('Migration applied successfully: Added total_produced to cap_production_logs');

    } catch (err) {
        console.error('Error applying migration:', err);
    } finally {
        await client.end();
    }
}

applyMigration();
