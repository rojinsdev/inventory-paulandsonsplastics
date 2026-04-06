-- Migration: Fix Inventory RPC Ambiguity
-- Created: 2026-04-03
-- Description: Standardizes adjust_cap_stock and adjust_inner_stock to avoid overload ambiguity.

BEGIN;

-- 1. Drop old 3-parameter versions specifically
DROP FUNCTION IF EXISTS public.adjust_cap_stock(UUID, UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.adjust_inner_stock(UUID, UUID, NUMERIC);

-- 2. Ensure only one version of adjust_cap_stock exists with 5 parameters
-- We drop the 5-parameter version too first to ensure a clean slate
DROP FUNCTION IF EXISTS public.adjust_cap_stock(UUID, UUID, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.adjust_cap_stock(
  p_cap_id UUID,
  p_factory_id UUID,
  p_quantity_change NUMERIC,
  p_state TEXT DEFAULT 'finished',
  p_unit_type TEXT DEFAULT 'loose'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type, last_updated)
    VALUES (p_cap_id, p_factory_id, p_quantity_change, p_state, p_unit_type, now())
    ON CONFLICT (cap_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
        last_updated = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Standardize adjust_inner_stock similarly
DROP FUNCTION IF EXISTS public.adjust_inner_stock(UUID, UUID, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.adjust_inner_stock(
  p_inner_id UUID,
  p_factory_id UUID,
  p_quantity_change NUMERIC,
  p_state TEXT DEFAULT 'finished',
  p_unit_type TEXT DEFAULT 'loose'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.inner_stock_balances (inner_id, factory_id, quantity, state, unit_type, last_updated)
    VALUES (p_inner_id, p_factory_id, p_quantity_change, p_state, p_unit_type, now())
    ON CONFLICT (inner_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = inner_stock_balances.quantity + EXCLUDED.quantity,
        last_updated = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Grant access to service role
GRANT EXECUTE ON FUNCTION public.adjust_cap_stock TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_cap_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inner_stock TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_inner_stock TO authenticated;

COMMIT;
