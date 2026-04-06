-- Migration: Consolidate adjust_stock RPC and Stock Constraints
-- Resolves: RPC overloading and inconsistent unique constraints on stock_balances

-- 1. Drop existing overloaded functions to avoid resolution ambiguity
-- Dropping all discovered variations
DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, text, numeric, uuid, text);
DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, public.inventory_state, numeric, uuid, text);
DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, text, integer, text, uuid, text, uuid, text, uuid, uuid);

-- 2. Consolidate unique constraints on stock_balances
-- We need ONE canonical unique index that covers ALL identity dimensions
ALTER TABLE public.stock_balances DROP CONSTRAINT IF EXISTS stock_balances_identity_unique;
ALTER TABLE public.stock_balances DROP CONSTRAINT IF EXISTS unique_stock_balance;
-- Drop index if it exists from previous failed attempts
DROP INDEX IF EXISTS public.stock_balances_full_identity_unique;

-- Use CREATE UNIQUE INDEX for NULLS NOT DISTINCT (Postgres 15+ feature)
-- This allows UPSERT to work correctly even when some identity columns are NULL
CREATE UNIQUE INDEX stock_balances_full_identity_unique 
ON public.stock_balances (product_id, factory_id, state, unit_type, cap_id, inner_id) 
NULLS NOT DISTINCT;

-- 3. Create single, unified adjust_stock function (7 parameters)
CREATE OR REPLACE FUNCTION adjust_stock(
    p_product_id UUID,
    p_factory_id UUID,
    p_state public.inventory_state,
    p_quantity_change NUMERIC,
    p_cap_id UUID DEFAULT NULL,
    p_inner_id UUID DEFAULT NULL,
    p_unit_type TEXT DEFAULT ''
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.stock_balances (
        product_id, 
        factory_id, 
        state, 
        quantity, 
        cap_id, 
        inner_id, 
        unit_type
    )
    VALUES (
        p_product_id, 
        p_factory_id, 
        p_state, 
        GREATEST(0, p_quantity_change), 
        p_cap_id, 
        p_inner_id, 
        COALESCE(p_unit_type, '')
    )
    ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id)
    DO UPDATE SET 
        quantity = stock_balances.quantity + p_quantity_change,
        last_updated = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access specifying exact parameters to reach the correct function
GRANT EXECUTE ON FUNCTION adjust_stock(uuid, uuid, public.inventory_state, numeric, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_stock(uuid, uuid, public.inventory_state, numeric, uuid, uuid, text) TO service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
