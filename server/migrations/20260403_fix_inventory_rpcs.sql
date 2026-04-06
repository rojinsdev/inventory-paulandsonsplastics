-- Migration: fix_cap_stock_adjustment
-- Created: 2026-04-03
-- Description: Updates adjust_cap_stock to handle unit_type and state parameters correctly.

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
