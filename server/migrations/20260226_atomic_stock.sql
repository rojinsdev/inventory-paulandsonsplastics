-- Migration: Atomic Stock Manipulation Functions
-- Description: Adds functions to safely increment/decrement stock with sufficiency checks.

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
    -- Get current quantity (lock for update to ensure consistency within the transaction if needed, 
    -- but ON CONFLICT will handle concurrent inserts)
    SELECT quantity INTO current_qty 
    FROM stock_balances 
    WHERE product_id = p_product_id 
      AND state = p_state::inventory_state;

    IF current_qty IS NULL THEN
        current_qty := 0;
    END IF;

    -- Check sufficiency if deducting
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

-- Function for raw material stock adjustment
CREATE OR REPLACE FUNCTION adjust_raw_material_stock(
    p_material_id UUID,
    p_weight_change NUMERIC
) RETURNS VOID AS $$
BEGIN
    UPDATE raw_materials 
    SET stock_weight_kg = stock_weight_kg + p_weight_change
    WHERE id = p_material_id;
END;
$$ LANGUAGE plpgsql;

-- Function for cap stock adjustment
CREATE OR REPLACE FUNCTION adjust_cap_stock(
    p_cap_id UUID,
    p_factory_id UUID,
    p_quantity_change NUMERIC
) RETURNS VOID AS $$
BEGIN
    INSERT INTO cap_stock_balances (cap_id, factory_id, quantity, last_updated)
    VALUES (p_cap_id, p_factory_id, p_quantity_change, now())
    ON CONFLICT (cap_id, factory_id)
    DO UPDATE SET 
        quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
        last_updated = now();
END;
$$ LANGUAGE plpgsql;
