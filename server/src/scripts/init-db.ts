import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const SCHEMA_DIR = path.join(__dirname, '../../../database/schema');

// Order matters due to Foreign Key constraints
const ORDERED_FILES = [
  'machines.sql',
  'products.sql',
  'production.sql',
  'inventory.sql',
  'sales.sql'
];

async function runMigrations() {
  // Use DIRECT_URL for migrations to avoid Transaction Pooling issues with DDL
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DIRECT_URL or DATABASE_URL is missing in .env');
    console.error('Please get the URI from Supabase Settings -> Database -> Connection string');
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

    for (const file of ORDERED_FILES) {
      const filePath = path.join(SCHEMA_DIR, file);
      console.log(`\n📄 Processing ${file}...`);

      try {
        const sql = fs.readFileSync(filePath, 'utf8');
        await client.query(sql);
        console.log(`✅ Successfully applied ${file}`);
      } catch (err: any) {
        console.error(`❌ Error logic in ${file}:`);
        console.error(err.message);
      }
    }

    console.log('\n🎉 All schemas processed!');

  } catch (err) {
    console.error('❌ Database connection error:', err);
  } finally {
    await client.end();
  }
}

runMigrations();
