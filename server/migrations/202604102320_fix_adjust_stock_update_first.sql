-- Fix: stock_balances_quantity_check violation on pack (deduct semi_finished).
-- Cause: INSERT ... ON CONFLICT with a negative p_quantity_change inserts a new row when no row
--        matches the unique key (e.g. cap_id/inner_id/unit_type mismatch), violating quantity >= 0.
-- Fix: UPDATE matching row(s) first; try legacy unit_type '' when v_unit is 'loose'; INSERT only for
--      positive deltas when no row exists; refuse negative delta if no row to update.

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
DECLARE
    v_unit text := COALESCE(NULLIF(BTRIM(p_unit_type), ''), 'loose');
    v_state public.inventory_state := p_state::public.inventory_state;
    n int;
BEGIN
    UPDATE public.stock_balances
    SET quantity = quantity + p_quantity_change,
        updated_at = now()
    WHERE product_id = p_product_id
      AND factory_id = p_factory_id
      AND state = v_state
      AND cap_id IS NOT DISTINCT FROM p_cap_id
      AND inner_id IS NOT DISTINCT FROM p_inner_id
      AND unit_type = v_unit;
    GET DIAGNOSTICS n = ROW_COUNT;

    IF n = 0 AND v_unit = 'loose' THEN
        UPDATE public.stock_balances
        SET quantity = quantity + p_quantity_change,
            updated_at = now()
        WHERE product_id = p_product_id
          AND factory_id = p_factory_id
          AND state = v_state
          AND cap_id IS NOT DISTINCT FROM p_cap_id
          AND inner_id IS NOT DISTINCT FROM p_inner_id
          AND (unit_type = '' OR unit_type IS NULL);
        GET DIAGNOSTICS n = ROW_COUNT;
    END IF;

    IF n = 0 THEN
        IF p_quantity_change < 0 THEN
            RAISE EXCEPTION
                'Cannot deduct stock: no matching stock_balances row for this product/state (check unit_type, cap_id, inner_id)'
                USING ERRCODE = 'P0001';
        END IF;
        IF p_quantity_change = 0 THEN
            RETURN;
        END IF;
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
            v_state,
            p_quantity_change,
            p_cap_id,
            v_unit,
            p_inner_id,
            now()
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, text, numeric, uuid, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, text, numeric, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, text, numeric, uuid, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
