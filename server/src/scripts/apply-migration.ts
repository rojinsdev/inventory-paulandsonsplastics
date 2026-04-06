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
      ALTER TABLE cap_production_logs ADD COLUMN IF NOT EXISTS downtime_minutes INTEGER DEFAULT 0;
      ALTER TABLE cap_production_logs ADD COLUMN IF NOT EXISTS downtime_reason TEXT;
      ALTER TABLE inner_production_logs ADD COLUMN IF NOT EXISTS downtime_minutes INTEGER DEFAULT 0;
      ALTER TABLE inner_production_logs ADD COLUMN IF NOT EXISTS downtime_reason TEXT;
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
