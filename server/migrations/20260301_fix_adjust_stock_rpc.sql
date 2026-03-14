    -- Migration: Fix adjust_stock RPC for Template-Variant Architecture
    -- Cause: Migrations 013 and 022 changed stock_balances unique constraint to
    --        (product_id, state, factory_id, cap_id) but this function still used
    --        ON CONFLICT (product_id, state) which no longer matches any constraint.
    -- Fix: Use UPDATE-then-INSERT pattern. Use "IS NOT DISTINCT FROM" to handle NULL cap_id.

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
        -- 1. Get current quantity for this EXACT stock dimension.
        --    "IS NOT DISTINCT FROM" handles NULL correctly: NULL IS NOT DISTINCT FROM NULL = TRUE
        SELECT quantity INTO current_qty
        FROM stock_balances
        WHERE product_id = p_product_id
        AND factory_id = p_factory_id
        AND state = p_state::inventory_state
        AND cap_id IS NOT DISTINCT FROM p_cap_id;

        IF current_qty IS NULL THEN
            current_qty := 0;
        END IF;

        -- 2. Reject if deduction would cause negative stock
        IF p_quantity_change < 0 AND (current_qty + p_quantity_change) < 0 THEN
            RAISE EXCEPTION 'Insufficient stock in % state. Available: %, Requested: %',
                p_state, current_qty, ABS(p_quantity_change);
        END IF;

        -- 3. Try updating the existing row first
        UPDATE stock_balances
        SET
            quantity     = quantity + p_quantity_change,
            last_updated = now()
        WHERE product_id = p_product_id
        AND factory_id = p_factory_id
        AND state = p_state::inventory_state
        AND cap_id IS NOT DISTINCT FROM p_cap_id;

        -- 4. If no existing row, insert a new one
        IF NOT FOUND THEN
            INSERT INTO stock_balances (product_id, factory_id, state, cap_id, quantity, last_updated)
            VALUES (p_product_id, p_factory_id, p_state::inventory_state, p_cap_id, p_quantity_change, now());
        END IF;
    END;
    $$ LANGUAGE plpgsql;

    -- Reload PostgREST schema cache
    NOTIFY pgrst, 'reload schema';
