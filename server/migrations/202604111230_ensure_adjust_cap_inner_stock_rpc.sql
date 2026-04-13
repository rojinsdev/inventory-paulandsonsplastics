-- PostgREST: "Could not find the function public.adjust_cap_stock(p_cap_id, p_factory_id, ...)"
-- Causes: function dropped (e.g. CASCADE) and not recreated, missing GRANT, or stale schema cache.
-- Ensures a single 5-arg signature matching server/src/modules/inventory/inventory.service.ts RPC calls.

DROP FUNCTION IF EXISTS public.adjust_cap_stock(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.adjust_cap_stock(uuid, uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.adjust_cap_stock(uuid, uuid, numeric, character varying, character varying);

CREATE OR REPLACE FUNCTION public.adjust_cap_stock(
    p_cap_id uuid,
    p_factory_id uuid,
    p_quantity_change numeric,
    p_state text DEFAULT 'finished',
    p_unit_type text DEFAULT 'loose'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type, updated_at)
    VALUES (p_cap_id, p_factory_id, p_quantity_change, p_state, p_unit_type, now())
    ON CONFLICT (cap_id, factory_id, state, unit_type)
    DO UPDATE SET
        quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_cap_stock(uuid, uuid, numeric, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.adjust_cap_stock(uuid, uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_cap_stock(uuid, uuid, numeric, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.adjust_inner_stock(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.adjust_inner_stock(uuid, uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.adjust_inner_stock(uuid, uuid, numeric, character varying, character varying);

CREATE OR REPLACE FUNCTION public.adjust_inner_stock(
    p_inner_id uuid,
    p_factory_id uuid,
    p_quantity_change numeric,
    p_state text DEFAULT 'finished',
    p_unit_type text DEFAULT 'loose'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.inner_stock_balances (inner_id, factory_id, quantity, state, unit_type, updated_at)
    VALUES (p_inner_id, p_factory_id, p_quantity_change, p_state, p_unit_type, now())
    ON CONFLICT (inner_id, factory_id, state, unit_type)
    DO UPDATE SET
        quantity = inner_stock_balances.quantity + EXCLUDED.quantity,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_inner_stock(uuid, uuid, numeric, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.adjust_inner_stock(uuid, uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inner_stock(uuid, uuid, numeric, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
