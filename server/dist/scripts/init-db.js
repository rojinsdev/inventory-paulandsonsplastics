"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const SCHEMA_DIR = path_1.default.join(__dirname, '../../../database/schema');
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
    const client = new pg_1.Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });
    try {
        console.log('🔌 Connecting to database...');
        await client.connect();
        console.log('✅ Connected.');
        for (const file of ORDERED_FILES) {
            const filePath = path_1.default.join(SCHEMA_DIR, file);
            console.log(`\n📄 Processing ${file}...`);
            try {
                const sql = fs_1.default.readFileSync(filePath, 'utf8');
                await client.query(sql);
                console.log(`✅ Successfully applied ${file}`);
            }
            catch (err) {
                console.error(`❌ Error logic in ${file}:`);
                console.error(err.message);
            }
        }
        console.log('\n🎉 All schemas processed!');
    }
    catch (err) {
        console.error('❌ Database connection error:', err);
    }
    finally {
        await client.end();
    }
}
runMigrations();
