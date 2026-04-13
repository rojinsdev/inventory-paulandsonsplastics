-- Consolidation of inventory RPCs to resolve function ambiguity and standardize 'loose' unit type
-- Date: 2026-04-07

-- 1. Standardize existing data: Change '' to 'loose' for unit types
UPDATE stock_balances SET unit_type = 'loose' WHERE unit_type = '' OR unit_type IS NULL;
UPDATE inventory_transactions SET unit_type = 'loose' WHERE unit_type = '' OR unit_type IS NULL;

-- 2. Consolidate adjust_stock
-- First drop all possible variations that cause ambiguity
DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, text, numeric, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, inventory_state, numeric, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.adjust_stock(
    p_product_id uuid,
    p_factory_id uuid,
    p_state text,
    p_quantity_change numeric,
    p_cap_id uuid DEFAULT NULL,
    p_unit_type text DEFAULT 'loose',
    p_inner_id uuid DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO stock_balances (
        product_id, factory_id, state, quantity, cap_id, unit_type, inner_id, updated_at
    )
    VALUES (
        p_product_id, p_factory_id, p_state, p_quantity_change, p_cap_id, p_unit_type, p_inner_id, now()
    )
    ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id)
    DO UPDATE SET 
        quantity = stock_balances.quantity + EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

-- 3. Consolidate adjust_cap_stock
DROP FUNCTION IF EXISTS public.adjust_cap_stock(uuid, uuid, numeric, character varying, character varying);
DROP FUNCTION IF EXISTS public.adjust_cap_stock(uuid, uuid, numeric, text, text);

CREATE OR REPLACE FUNCTION public.adjust_cap_stock(
    p_cap_id uuid,
    p_factory_id uuid,
    p_quantity_change numeric,
    p_state text DEFAULT 'packed',
    p_unit_type text DEFAULT 'units'
)
RETURNS void AS $$
BEGIN
    INSERT INTO cap_stock_balances (
        cap_id, factory_id, state, quantity, unit_type, updated_at
    )
    VALUES (
        p_cap_id, p_factory_id, p_state, p_quantity_change, p_unit_type, now()
    )
    ON CONFLICT (cap_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

-- 4. Consolidate adjust_inner_stock
DROP FUNCTION IF EXISTS public.adjust_inner_stock(uuid, uuid, numeric, character varying, character varying);
DROP FUNCTION IF EXISTS public.adjust_inner_stock(uuid, uuid, numeric, text, text);

CREATE OR REPLACE FUNCTION public.adjust_inner_stock(
    p_inner_id uuid,
    p_factory_id uuid,
    p_quantity_change numeric,
    p_state text DEFAULT 'packed',
    p_unit_type text DEFAULT 'units'
)
RETURNS void AS $$
BEGIN
    INSERT INTO inner_stock_balances (
        inner_id, factory_id, state, quantity, unit_type, updated_at
    )
    VALUES (
        p_inner_id, p_factory_id, p_state, p_quantity_change, p_unit_type, now()
    )
    ON CONFLICT (inner_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = inner_stock_balances.quantity + EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;
