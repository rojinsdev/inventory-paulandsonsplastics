-- Fix: "Could not choose the best candidate function" when calling adjust_stock (e.g. POST /api/inventory/pack from mobile).
-- Cause: two overloads — p_state as inventory_state vs text, and differing (cap_id, inner_id, unit_type) order — both match named RPC args.
-- Resolution: drop all overloads; single canonical function with p_state text (cast inside) and parameter order matching app/PostgREST.
--
-- Order: apply 202604102320_fix_adjust_stock_update_first.sql (or 202604111200_repair_*) AFTER this file.
-- Do not re-apply this file after 102320 — it replaces adjust_stock with INSERT-only and undoes the pack/deduct fix.

DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, text, numeric, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, public.inventory_state, numeric, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, public.inventory_state, numeric, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, text, numeric, uuid, text);
DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, public.inventory_state, numeric, uuid, text);
DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, text, numeric, uuid);
DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, public.inventory_state, numeric, uuid);
DROP FUNCTION IF EXISTS public.adjust_stock(uuid, uuid, numeric, character varying, uuid, uuid, character varying);

CREATE OR REPLACE FUNCTION public.adjust_stock(
    p_product_id uuid,
    p_factory_id uuid,
    p_state text,
    p_quantity_change numeric,
    p_cap_id uuid DEFAULT NULL,
    p_unit_type text DEFAULT 'loose',
    p_inner_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.stock_balances (
        product_id,
        factory_id,
        state,
        quantity,
        cap_id,
        unit_type,
        inner_id,
        updated_at
    )
    VALUES (
        p_product_id,
        p_factory_id,
        p_state::public.inventory_state,
        p_quantity_change,
        p_cap_id,
        COALESCE(NULLIF(BTRIM(p_unit_type), ''), 'loose'),
        p_inner_id,
        now()
    )
    ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id)
    DO UPDATE SET
        quantity = stock_balances.quantity + EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, text, numeric, uuid, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, text, numeric, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, text, numeric, uuid, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
