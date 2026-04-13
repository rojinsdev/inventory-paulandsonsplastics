-- Fix: ON CONFLICT clauses in production RPCs require unique constraints
-- that were missing from stock_balances and cap_stock_balances.
-- inner_stock_balances already had the correct constraint.

-- Step 1: Consolidate any duplicate rows in stock_balances before adding constraint
-- (duplicates can exist from multiple non-atomic inserts before this fix)
DO $$
DECLARE
    dup RECORD;
BEGIN
    FOR dup IN
        SELECT product_id, factory_id, state, unit_type, SUM(quantity) as total_qty
        FROM public.stock_balances
        GROUP BY product_id, factory_id, state, unit_type
        HAVING COUNT(*) > 1
    LOOP
        -- Update the newest row with the summed quantity
        UPDATE public.stock_balances
        SET quantity = dup.total_qty, updated_at = NOW()
        WHERE id = (
            SELECT id FROM public.stock_balances
            WHERE product_id = dup.product_id
              AND factory_id = dup.factory_id
              AND state = dup.state
              AND unit_type = dup.unit_type
            ORDER BY updated_at DESC
            LIMIT 1
        );

        -- Delete the older duplicate rows
        DELETE FROM public.stock_balances
        WHERE product_id = dup.product_id
          AND factory_id = dup.factory_id
          AND state = dup.state
          AND unit_type = dup.unit_type
          AND id != (
            SELECT id FROM public.stock_balances
            WHERE product_id = dup.product_id
              AND factory_id = dup.factory_id
              AND state = dup.state
              AND unit_type = dup.unit_type
            ORDER BY updated_at DESC
            LIMIT 1
        );
    END LOOP;
END $$;

-- Step 2: Consolidate any duplicate rows in cap_stock_balances
DO $$
DECLARE
    dup RECORD;
BEGIN
    FOR dup IN
        SELECT cap_id, factory_id, state, unit_type, SUM(quantity) as total_qty
        FROM public.cap_stock_balances
        GROUP BY cap_id, factory_id, state, unit_type
        HAVING COUNT(*) > 1
    LOOP
        UPDATE public.cap_stock_balances
        SET quantity = dup.total_qty, updated_at = NOW()
        WHERE id = (
            SELECT id FROM public.cap_stock_balances
            WHERE cap_id = dup.cap_id
              AND factory_id = dup.factory_id
              AND state = dup.state
              AND unit_type = dup.unit_type
            ORDER BY updated_at DESC
            LIMIT 1
        );

        DELETE FROM public.cap_stock_balances
        WHERE cap_id = dup.cap_id
          AND factory_id = dup.factory_id
          AND state = dup.state
          AND unit_type = dup.unit_type
          AND id != (
            SELECT id FROM public.cap_stock_balances
            WHERE cap_id = dup.cap_id
              AND factory_id = dup.factory_id
              AND state = dup.state
              AND unit_type = dup.unit_type
            ORDER BY updated_at DESC
            LIMIT 1
        );
    END LOOP;
END $$;

-- Step 3: Add the missing unique constraints
ALTER TABLE public.stock_balances
    ADD CONSTRAINT stock_balances_product_id_factory_id_state_unit_type_key
    UNIQUE (product_id, factory_id, state, unit_type);

ALTER TABLE public.cap_stock_balances
    ADD CONSTRAINT cap_stock_balances_cap_id_factory_id_state_unit_type_key
    UNIQUE (cap_id, factory_id, state, unit_type);
