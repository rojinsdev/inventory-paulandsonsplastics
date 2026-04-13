-- Fix: include_inner=true orders failing when product.inner_id is not set
--
-- ROOT CAUSE CHAIN:
-- 1. products.inner_id is NULL for products whose inner is defined only via
--    product_templates.inner_template_id (not set directly on the product row).
-- 2. create_order_atomic reads v_target_inner_id := product.inner_id → gets NULL.
--    Stock check then does: inner_id = NULL (PostgreSQL: always evaluates to NULL,
--    never TRUE) → finds 0 stock → marks as backordered even when 24,000+ packed
--    units exist → fires a spurious production request.
-- 3. prepare_order_items_atomic reads soi.inner_id = NULL → same failure.
--
-- FIXES:
-- A. Data: backfill products.inner_id from their highest-quantity packed stock row.
-- B. create_order_atomic: add 2-level fallback when product.inner_id is null:
--      1st: find inner from existing packed stock (most qty first)
--      2nd: find inner from inner_template
--    Also: when v_target_inner_id is still NULL after fallback, treat as
--    "any inner" (same as include_inner=false) to avoid silent 0-stock results.
-- C. prepare_order_items_atomic: guard include_inner=TRUE + inner_id IS NULL
--    with (v_inner_id IS NULL OR inner_id = v_inner_id) so stale order items
--    don't hard-fail.

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Backfill products.inner_id from packed stock
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.products p
SET inner_id = sb.inner_id
FROM (
    SELECT DISTINCT ON (product_id)
        product_id, inner_id
    FROM public.stock_balances
    WHERE inner_id IS NOT NULL
      AND state IN ('packed', 'finished')
    ORDER BY product_id, quantity DESC
) sb
WHERE p.id = sb.product_id
  AND p.inner_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Fix create_order_atomic
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_customer_id uuid,
    p_delivery_date text,
    p_notes text,
    p_user_id uuid,
    p_items jsonb,
    p_order_date text
) RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_order_id UUID;
    v_item RECORD;
    v_resource_data RECORD;
    v_factory_id UUID;
    v_available_stock INT;
    v_is_backordered BOOLEAN;
    v_main_factory_id UUID := '7ec2471f-c1c4-4603-9181-0cbde159420b';
    v_total_amount NUMERIC := 0;
    v_customer_balance NUMERIC;
    v_customer_limit NUMERIC;
    v_target_inner_id UUID;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID, cap_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN
    ) LOOP
        IF v_item.product_id IS NOT NULL THEN
            SELECT selling_price INTO v_resource_data FROM public.products WHERE id = v_item.product_id;
            v_total_amount := v_total_amount + (v_item.quantity * COALESCE(v_item.unit_price, v_resource_data.selling_price, 0));
        ELSIF v_item.cap_id IS NOT NULL THEN
            v_total_amount := v_total_amount + (v_item.quantity * COALESCE(v_item.unit_price, 0));
        END IF;
    END LOOP;

    SELECT balance_due, credit_limit INTO v_customer_balance, v_customer_limit
    FROM public.customers WHERE id = p_customer_id;

    IF (COALESCE(v_customer_balance, 0) + v_total_amount) > COALESCE(v_customer_limit, 999999999) THEN
        RAISE EXCEPTION 'Order blocked: Total balance with this order (%) would exceed credit limit (%)',
            (COALESCE(v_customer_balance, 0) + v_total_amount), v_customer_limit;
    END IF;

    INSERT INTO public.sales_orders (
        customer_id, delivery_date, status, notes, created_by, order_date,
        total_amount, balance_due, amount_paid
    ) VALUES (
        p_customer_id,
        CASE WHEN p_delivery_date IS NULL OR p_delivery_date = '' THEN NULL ELSE p_delivery_date::DATE END,
        'pending', p_notes, p_user_id, p_order_date::DATE,
        v_total_amount, v_total_amount, 0
    ) RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID, cap_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN
    ) LOOP
        IF v_item.product_id IS NOT NULL THEN
            SELECT p.selling_price, p.factory_id, p.inner_id, pt.inner_template_id
            INTO v_resource_data
            FROM public.products p
            LEFT JOIN public.product_templates pt ON p.template_id = pt.id
            WHERE p.id = v_item.product_id;

            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);
            v_target_inner_id := NULL;

            IF v_item.include_inner = TRUE THEN
                -- Level 1: use product.inner_id directly
                v_target_inner_id := v_resource_data.inner_id;

                -- Level 2: resolve from existing packed stock (most qty first)
                IF v_target_inner_id IS NULL THEN
                    SELECT inner_id INTO v_target_inner_id
                    FROM public.stock_balances
                    WHERE product_id = v_item.product_id
                      AND inner_id IS NOT NULL
                      AND state IN ('packed', 'finished')
                      AND (factory_id = v_factory_id OR factory_id IS NULL)
                    ORDER BY quantity DESC
                    LIMIT 1;
                END IF;

                -- Level 3: resolve from inner_template
                IF v_target_inner_id IS NULL AND v_resource_data.inner_template_id IS NOT NULL THEN
                    SELECT id INTO v_target_inner_id
                    FROM public.inners
                    WHERE template_id = v_resource_data.inner_template_id
                    LIMIT 1;
                END IF;
            END IF;

            -- Stock check:
            --   include_inner=FALSE → any stock regardless of inner_id
            --   include_inner=TRUE  → match specific inner_id (if resolved), or any if still null
            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.stock_balances
            WHERE product_id = v_item.product_id
              AND unit_type = COALESCE(v_item.unit_type, 'bundle')
              AND state IN ('semi_finished', 'packed', 'finished')
              AND (factory_id = v_factory_id OR factory_id IS NULL)
              AND (
                COALESCE(v_item.include_inner, FALSE) = FALSE
                OR (v_item.include_inner = TRUE AND (v_target_inner_id IS NULL OR inner_id = v_target_inner_id))
              );

            v_is_backordered := v_available_stock < v_item.quantity;

            INSERT INTO public.sales_order_items (
                order_id, product_id, quantity, quantity_prepared, quantity_reserved,
                unit_type, unit_price, is_backordered, is_prepared,
                include_inner, inner_id
            ) VALUES (
                v_order_id, v_item.product_id, v_item.quantity, 0, 0,
                COALESCE(v_item.unit_type, 'bundle'),
                COALESCE(v_item.unit_price, v_resource_data.selling_price, 0),
                v_is_backordered, FALSE,
                COALESCE(v_item.include_inner, FALSE),
                v_target_inner_id  -- correctly resolved UUID or NULL
            );

        ELSIF v_item.cap_id IS NOT NULL THEN
            SELECT factory_id INTO v_resource_data FROM public.caps WHERE id = v_item.cap_id;
            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);

            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.cap_stock_balances
            WHERE cap_id = v_item.cap_id
              AND unit_type = COALESCE(v_item.unit_type, 'loose')
              AND state IN ('semi_finished', 'finished')
              AND (factory_id = v_factory_id OR factory_id IS NULL);

            v_is_backordered := v_available_stock < v_item.quantity;

            INSERT INTO public.sales_order_items (
                order_id, cap_id, quantity, quantity_prepared, quantity_reserved,
                unit_type, unit_price, is_backordered, is_prepared
            ) VALUES (
                v_order_id, v_item.cap_id, v_item.quantity, 0, 0,
                COALESCE(v_item.unit_type, 'loose'),
                COALESCE(v_item.unit_price, 0),
                v_is_backordered, FALSE
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'total_amount', v_total_amount);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Fix prepare_order_items_atomic (NULL-safe include_inner filter)
-- ─────────────────────────────────────────────────────────────────────────────
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

      IF v_already_reserved + v_qty_to_reserve > v_total_needed THEN
        RAISE EXCEPTION 'Cannot reserve % units for item %. Total needed: %, already reserved: %',
          v_qty_to_reserve, v_item.item_id, v_total_needed, v_already_reserved;
      END IF;

      IF v_is_backordered THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_prepared_qty_available
        FROM public.production_requests
        WHERE sales_order_id = p_order_id
          AND (product_id = v_product_id OR (product_id IS NULL AND v_product_id IS NULL))
          AND (cap_id = v_cap_id OR (cap_id IS NULL AND v_cap_id IS NULL))
          AND (inner_id = v_inner_id OR (inner_id IS NULL AND v_inner_id IS NULL))
          AND status = 'prepared'::production_request_status;

        IF v_already_reserved + v_qty_to_reserve > v_prepared_qty_available THEN
          RAISE EXCEPTION 'Cannot reserve % units for backordered item %. Only % units have been marked as Prepared via production.',
            v_qty_to_reserve, v_item.item_id, v_prepared_qty_available;
        END IF;
      END IF;

      IF v_product_id IS NOT NULL THEN
        SELECT factory_id INTO v_factory_id FROM public.products WHERE id = v_product_id;

        v_source_state := CASE v_unit_type
          WHEN 'loose'  THEN 'semi_finished'
          WHEN 'packet' THEN 'packed'
          WHEN 'bundle' THEN 'finished'
          ELSE 'finished'
        END;

        -- include_inner=FALSE → any inner_id (or null)
        -- include_inner=TRUE, inner_id set → match that specific inner_id
        -- include_inner=TRUE, inner_id NULL (stale order) → treat as any (safe fallback)
        SELECT SUM(quantity) INTO v_available_stock
        FROM public.stock_balances
        WHERE product_id = v_product_id
          AND state = v_source_state::inventory_state
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND (unit_type = v_unit_type OR (v_unit_type = 'loose' AND unit_type = ''))
          AND (
            COALESCE(v_include_inner, FALSE) = FALSE
            OR (v_include_inner = TRUE AND (v_inner_id IS NULL OR inner_id = v_inner_id))
          );

        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
          RAISE EXCEPTION 'Insufficient physical stock for product %. Required: %, Available: % in state %',
            v_product_id, v_qty_to_reserve, COALESCE(v_available_stock, 0), v_source_state;
        END IF;

        FOR v_balance IN
          SELECT id, quantity, cap_id, inner_id, unit_type
          FROM public.stock_balances
          WHERE product_id = v_product_id
            AND state = v_source_state::inventory_state
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND (unit_type = v_unit_type OR (v_unit_type = 'loose' AND unit_type = ''))
            AND (
              COALESCE(v_include_inner, FALSE) = FALSE
              OR (v_include_inner = TRUE AND (v_inner_id IS NULL OR inner_id = v_inner_id))
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

  IF NOT EXISTS (
    SELECT 1 FROM public.sales_order_items
    WHERE order_id = p_order_id AND quantity_reserved < quantity
  ) THEN
    UPDATE public.sales_orders SET status = 'reserved', updated_at = NOW()
    WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'reserved_count', v_updated_count);
END;
$function$;
