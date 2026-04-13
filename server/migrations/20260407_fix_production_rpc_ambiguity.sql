-- Migration: Fix Production RPC Ambiguity
-- Created: 2026-04-07
-- Description: Drops overloaded versions of adjust_cap_stock and adjust_inner_stock and unifies them.

-- 1. DROP ALL EXISTING VARIATIONS of adjust_cap_stock
DROP FUNCTION IF EXISTS public.adjust_cap_stock(uuid, uuid, numeric, character varying, character varying);
DROP FUNCTION IF EXISTS public.adjust_cap_stock(uuid, uuid, numeric, text, text);

-- 2. CREATE THE UNIFIED VERSION of adjust_cap_stock
CREATE OR REPLACE FUNCTION public.adjust_cap_stock(
    p_cap_id uuid,
    p_factory_id uuid,
    p_quantity_change numeric,
    p_state text DEFAULT 'packed'::text,
    p_unit_type text DEFAULT 'units'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type)
    VALUES (p_cap_id, p_factory_id, p_quantity_change, p_state, p_unit_type)
    ON CONFLICT (cap_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = public.cap_stock_balances.quantity + p_quantity_change,
        updated_at = now();
END;
$$;

-- 3. DROP ALL EXISTING VARIATIONS of adjust_inner_stock
DROP FUNCTION IF EXISTS public.adjust_inner_stock(uuid, uuid, numeric, character varying, character varying);
DROP FUNCTION IF EXISTS public.adjust_inner_stock(uuid, uuid, numeric, text, text);

-- 4. CREATE THE UNIFIED VERSION of adjust_inner_stock
CREATE OR REPLACE FUNCTION public.adjust_inner_stock(
    p_inner_id uuid,
    p_factory_id uuid,
    p_quantity_change numeric,
    p_state text DEFAULT 'packed'::text,
    p_unit_type text DEFAULT 'units'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.inner_stock_balances (inner_id, factory_id, quantity, state, unit_type)
    VALUES (p_inner_id, p_factory_id, p_quantity_change, p_state, p_unit_type)
    ON CONFLICT (inner_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = public.inner_stock_balances.quantity + p_quantity_change,
        updated_at = now();
END;
$$;
