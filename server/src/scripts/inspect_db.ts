import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function inspect() {
    const client = new Client({
        connectionString: process.env.DIRECT_URL,
        ssl: { rejectUnauthorized: false }
    });
    await client.connect();

    console.log('--- cap_templates columns ---');
    const res1 = await client.query(`
        SELECT column_name
        FROM information_schema.columns 
        WHERE table_name = 'cap_templates'
    `);
    console.log(res1.rows.map(r => r.column_name).join(', '));

    console.log('\n--- caps columns ---');
    const res2 = await client.query(`
        SELECT column_name
        FROM information_schema.columns 
        WHERE table_name = 'caps'
    `);
    console.log(res2.rows.map(r => r.column_name).join(', '));

    await client.end();
}
inspect();
