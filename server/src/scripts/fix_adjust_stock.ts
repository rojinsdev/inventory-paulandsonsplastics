import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const sql = `
CREATE OR REPLACE FUNCTION adjust_stock(
    p_product_id UUID,
    p_factory_id UUID,
    p_state TEXT,
    p_quantity_change NUMERIC,
    p_cap_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    current_qty NUMERIC;
BEGIN
    SELECT quantity INTO current_qty 
    FROM stock_balances 
    WHERE product_id = p_product_id 
      AND state = p_state::inventory_state;

    IF current_qty IS NULL THEN
        current_qty := 0;
    END IF;

    IF p_quantity_change < 0 AND (current_qty + p_quantity_change) < 0 THEN
        RAISE EXCEPTION 'Insufficient stock in % state. Available: %, Requested: %', p_state, current_qty, ABS(p_quantity_change);
    END IF;

    INSERT INTO stock_balances (product_id, state, quantity, last_updated)
    VALUES (p_product_id, p_state::inventory_state, p_quantity_change, now())
    ON CONFLICT (product_id, state)
    DO UPDATE SET 
        quantity = stock_balances.quantity + EXCLUDED.quantity,
        last_updated = now();
END;
$$ LANGUAGE plpgsql;
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
        await client.query(sql);
        console.log('✅ adjust_stock function updated successfully!');
    } catch (e: any) {
        console.error('❌ Failed to update:', e.message);
    } finally {
        await client.end();
    }
}

run();
