-- Fix: prepare_order_items_atomic had two bugs:
-- 1. The live DB version (from 202604090003) read `id` from JSONB but the service sends `item_id`
--    causing every reservation to silently do nothing (UPDATE WHERE id = NULL matches 0 rows).
-- 2. The cap branch hardcoded v_source_state := 'finished' but caps are stored as 'semi_finished'.
-- This migration applies the correct version from 202604090001 with the cap state bug also fixed.

DROP FUNCTION IF EXISTS public.prepare_order_items_atomic(uuid, jsonb, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.prepare_order_items_atomic(
    p_order_id uuid,
    p_items jsonb,
    p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_item RECORD;
  v_source_state TEXT;
  v_factory_id UUID;
  v_updated_count INT := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INT)
  LOOP
    DECLARE
      v_product_id UUID;
      v_cap_id UUID;
      v_inner_id UUID;
      v_include_inner BOOLEAN;
      v_unit_type TEXT;
      v_qty_to_reserve INT := v_item.quantity;
      v_already_reserved INT;
      v_total_needed INT;
      v_is_backordered BOOLEAN;
      v_balance RECORD;
      v_remaining_to_reserve INT := v_item.quantity;
      v_available_stock INT;
      v_prepared_qty_available INT := 0;
    BEGIN
      -- 1. Fetch item details from sales_order_items
      SELECT
        soi.product_id, soi.cap_id, soi.unit_type, soi.quantity,
        COALESCE(soi.quantity_reserved, 0), soi.is_backordered,
        soi.include_inner, soi.inner_id
      INTO
        v_product_id, v_cap_id, v_unit_type, v_total_needed,
        v_already_reserved, v_is_backordered,
        v_include_inner, v_inner_id
      FROM public.sales_order_items soi
      WHERE soi.id = v_item.item_id AND soi.order_id = p_order_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % not found in order %', v_item.item_id, p_order_id;
      END IF;

      -- 2. Validate: cannot reserve more than total ordered quantity
      IF v_already_reserved + v_qty_to_reserve > v_total_needed THEN
        RAISE EXCEPTION 'Cannot reserve % units for item %. Total needed: %, already reserved: %',
          v_qty_to_reserve, v_item.item_id, v_total_needed, v_already_reserved;
      END IF;

      -- 3. Validate backordered items: production must be marked "prepared" first
      IF v_is_backordered THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_prepared_qty_available
        FROM public.production_requests
        WHERE sales_order_id = p_order_id
          AND (product_id = v_product_id OR (product_id IS NULL AND v_product_id IS NULL))
          AND (cap_id = v_cap_id OR (cap_id IS NULL AND v_cap_id IS NULL))
          AND (inner_id = v_inner_id OR (inner_id IS NULL AND v_inner_id IS NULL))
          AND status = 'prepared'::production_request_status;

        IF v_already_reserved + v_qty_to_reserve > v_prepared_qty_available THEN
          RAISE EXCEPTION 'Cannot reserve % units for backordered item %. Only % units have been marked as "Prepared" via production.',
            v_qty_to_reserve, v_item.item_id, v_prepared_qty_available;
        END IF;
      END IF;

      -- 4. BRANCH: Product (tub) vs standalone Cap
      IF v_product_id IS NOT NULL THEN
        -- PRODUCT LOGIC: reserve from stock_balances
        SELECT factory_id INTO v_factory_id FROM public.products WHERE id = v_product_id;

        v_source_state := CASE v_unit_type
          WHEN 'loose'  THEN 'semi_finished'
          WHEN 'packet' THEN 'packed'
          WHEN 'bundle' THEN 'finished'
          ELSE 'finished'
        END;

        -- Check available stock, respecting inner requirement
        SELECT SUM(quantity) INTO v_available_stock
        FROM public.stock_balances
        WHERE product_id = v_product_id
          AND state = v_source_state::inventory_state
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND (unit_type = v_unit_type OR (v_unit_type = 'loose' AND unit_type = ''))
          AND (
            (COALESCE(v_include_inner, FALSE) = TRUE  AND inner_id = v_inner_id) OR
            (COALESCE(v_include_inner, FALSE) = FALSE AND inner_id IS NULL)
          );

        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
          RAISE EXCEPTION 'Insufficient physical stock for product %. Required: %, Available: % in state %',
            v_product_id, v_qty_to_reserve, COALESCE(v_available_stock, 0), v_source_state;
        END IF;

        -- Reserve: deduct from source, add to reserved (row-by-row, largest first)
        FOR v_balance IN
          SELECT id, quantity, cap_id, inner_id, unit_type
          FROM public.stock_balances
          WHERE product_id = v_product_id
            AND state = v_source_state::inventory_state
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND (unit_type = v_unit_type OR (v_unit_type = 'loose' AND unit_type = ''))
            AND (
              (COALESCE(v_include_inner, FALSE) = TRUE  AND inner_id = v_inner_id) OR
              (COALESCE(v_include_inner, FALSE) = FALSE AND inner_id IS NULL)
            )
            AND quantity > 0
          ORDER BY (unit_type = v_unit_type) DESC, quantity DESC
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;

          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.stock_balances
            SET quantity = quantity - v_deduct_qty, updated_at = NOW()
            WHERE id = v_balance.id;

            INSERT INTO public.stock_balances
              (product_id, factory_id, state, quantity, cap_id, inner_id, unit_type, updated_at)
            VALUES
              (v_product_id, v_factory_id, 'reserved'::inventory_state, v_deduct_qty,
               v_balance.cap_id, v_balance.inner_id, v_unit_type, NOW())
            ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id)
            DO UPDATE SET
              quantity   = stock_balances.quantity + EXCLUDED.quantity,
              updated_at = NOW();

            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;

      ELSIF v_cap_id IS NOT NULL THEN
        -- CAP LOGIC: reserve from cap_stock_balances
        -- Caps are stored as semi_finished/loose after production (no independent packing step)
        SELECT factory_id INTO v_factory_id FROM public.caps WHERE id = v_cap_id;
        v_source_state := 'semi_finished';

        SELECT SUM(quantity) INTO v_available_stock
        FROM public.cap_stock_balances
        WHERE cap_id = v_cap_id
          AND state = v_source_state
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND (
            unit_type = COALESCE(v_unit_type, 'loose')
            OR (COALESCE(v_unit_type, 'loose') = 'loose' AND (unit_type = '' OR unit_type IS NULL))
          );

        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
          RAISE EXCEPTION 'Insufficient physical stock for cap %. Required: %, Available: %',
            v_cap_id, v_qty_to_reserve, COALESCE(v_available_stock, 0);
        END IF;

        FOR v_balance IN
          SELECT id, quantity, unit_type
          FROM public.cap_stock_balances
          WHERE cap_id = v_cap_id
            AND state = v_source_state
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND (
              unit_type = COALESCE(v_unit_type, 'loose')
              OR (COALESCE(v_unit_type, 'loose') = 'loose' AND (unit_type = '' OR unit_type IS NULL))
            )
            AND quantity > 0
          ORDER BY (unit_type = COALESCE(v_unit_type, 'loose')) DESC, quantity DESC
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;

          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.cap_stock_balances
            SET quantity = quantity - v_deduct_qty, updated_at = NOW()
            WHERE id = v_balance.id;

            INSERT INTO public.cap_stock_balances
              (cap_id, factory_id, state, quantity, unit_type, updated_at)
            VALUES
              (v_cap_id, v_factory_id, 'reserved', v_deduct_qty,
               COALESCE(v_unit_type, 'loose'), NOW())
            ON CONFLICT (cap_id, factory_id, state, unit_type)
            DO UPDATE SET
              quantity   = cap_stock_balances.quantity + EXCLUDED.quantity,
              updated_at = NOW();

            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;
      END IF;

      -- 5. Update sales_order_items counters
      UPDATE public.sales_order_items
      SET
        quantity_reserved = quantity_reserved + v_item.quantity,
        quantity_prepared = quantity_prepared + v_item.quantity,
        is_prepared       = (quantity_reserved + v_item.quantity >= quantity),
        prepared_at       = CASE
                              WHEN (quantity_reserved + v_item.quantity >= quantity) THEN NOW()
                              ELSE prepared_at
                            END
      WHERE id = v_item.item_id;

      -- 6. Audit transaction
      INSERT INTO public.inventory_transactions (
        product_id, cap_id, from_state, to_state, quantity,
        transaction_type, reference_id, factory_id, created_by, unit_type
      ) VALUES (
        v_product_id, v_cap_id, v_source_state::inventory_state,
        'reserved'::inventory_state, v_item.quantity,
        'reserve', p_order_id, v_factory_id, p_user_id, v_unit_type
      );

      v_updated_count := v_updated_count + 1;
    END;
  END LOOP;

  -- 7. Auto-advance order to 'reserved' when all items are fully reserved
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_order_items
    WHERE order_id = p_order_id AND quantity_reserved < quantity
  ) THEN
    UPDATE public.sales_orders
    SET status = 'reserved', updated_at = NOW()
    WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'reserved_count', v_updated_count);
END;
$function$;
