-- Fix: False backordering when ordering packets/bundles that were packed WITH inner
--
-- PROBLEM: Both create_order_atomic and prepare_order_items_atomic filtered stock
-- with "inner_id IS NULL" when include_inner = false. But all packed stock has
-- inner_id set (physically packed WITH cap+inner). This caused:
--   1. create_order_atomic: sees 0 available stock → marks item as backordered → fires
--      a production request even though 24,000 packets exist.
--   2. prepare_order_items_atomic: same filter → "Insufficient physical stock ... Available: 0 in state packed"
--
-- FIX: When include_inner = FALSE, do NOT filter by inner_id at all — match any
-- packed row regardless of whether it has an inner. The include_inner flag on the
-- ORDER ITEM means "customer specifically requires inner as a named component",
-- not "only fetch stock that was physically packed without an inner".
-- When include_inner = TRUE the filter still requires inner_id = v_target_inner_id.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix create_order_atomic (backorder stock check)
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
    -- 1. Pre-calculate total amount
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

    -- 2. Validate Credit Limit
    SELECT balance_due, credit_limit INTO v_customer_balance, v_customer_limit
    FROM public.customers WHERE id = p_customer_id;

    IF (COALESCE(v_customer_balance, 0) + v_total_amount) > COALESCE(v_customer_limit, 999999999) THEN
        RAISE EXCEPTION 'Order blocked: Total balance with this order (%) would exceed credit limit (%)',
            (COALESCE(v_customer_balance, 0) + v_total_amount), v_customer_limit;
    END IF;

    -- 3. Create Sales Order
    INSERT INTO public.sales_orders (
        customer_id, delivery_date, status, notes, created_by, order_date,
        total_amount, balance_due, amount_paid
    ) VALUES (
        p_customer_id,
        CASE WHEN p_delivery_date IS NULL OR p_delivery_date = '' THEN NULL ELSE p_delivery_date::DATE END,
        'pending', p_notes, p_user_id, p_order_date::DATE,
        v_total_amount, v_total_amount, 0
    ) RETURNING id INTO v_order_id;

    -- 4. Process Items
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
                v_target_inner_id := v_resource_data.inner_id;
            END IF;

            -- Stock check: when include_inner = TRUE, must match specific inner_id.
            -- When include_inner = FALSE, match any packed stock regardless of inner_id
            -- (packed stock physically contains cap+inner; the flag only means the customer
            --  specifically requested a named inner as a line item).
            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.stock_balances
            WHERE product_id = v_item.product_id
              AND unit_type = COALESCE(v_item.unit_type, 'bundle')
              AND state IN ('semi_finished', 'packed', 'finished')
              AND (factory_id = v_factory_id OR factory_id IS NULL)
              AND (
                  COALESCE(v_item.include_inner, FALSE) = FALSE
                  OR (v_item.include_inner = TRUE AND inner_id = v_target_inner_id)
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
                v_target_inner_id
            );

        ELSIF v_item.cap_id IS NOT NULL THEN
            SELECT factory_id INTO v_resource_data FROM public.caps WHERE id = v_item.cap_id;
            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);

            -- Caps are stored as semi_finished after production
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
-- 2. Fix prepare_order_items_atomic (reservation stock check + reservation loop)
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

        -- When include_inner = TRUE: only match rows with the specific inner_id.
        -- When include_inner = FALSE: match any row regardless of inner_id
        -- (packed stock is physically packed WITH inner; the flag only means the
        --  customer explicitly requested a named inner as a trackable component).
        SELECT SUM(quantity) INTO v_available_stock
        FROM public.stock_balances
        WHERE product_id = v_product_id
          AND state = v_source_state::inventory_state
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND (unit_type = v_unit_type OR (v_unit_type = 'loose' AND unit_type = ''))
          AND (
            COALESCE(v_include_inner, FALSE) = FALSE
            OR (v_include_inner = TRUE AND inner_id = v_inner_id)
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
              OR (v_include_inner = TRUE AND inner_id = v_inner_id)
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
    UPDATE public.sales_orders
    SET status = 'reserved', updated_at = NOW()
    WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'reserved_count', v_updated_count);
END;
$function$;
