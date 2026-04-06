-- DYNAMIC FUNC SYNC

DROP FUNCTION IF EXISTS public.submit_production_atomic(uuid, uuid, integer, time without time zone, time without time zone, integer, integer, numeric, numeric, integer, text, date, uuid, uuid, integer, numeric, boolean, numeric);
CREATE OR REPLACE FUNCTION public.submit_production_atomic(p_machine_id uuid, p_product_id uuid, p_shift_number integer, p_start_time time without time zone, p_end_time time without time zone, p_total_produced integer, p_damaged_count integer, p_actual_cycle_time_seconds numeric, p_actual_weight_grams numeric, p_downtime_minutes integer, p_downtime_reason text, p_date date, p_user_id uuid, p_factory_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_log_id UUID;
  v_actual_quantity INT;
  v_weight_grams NUMERIC;
  v_raw_material_id UUID;
  v_ideal_cycle_time NUMERIC;
  v_weight_wastage_kg NUMERIC;
  v_flagged_for_review BOOLEAN;
  v_required_material_kg NUMERIC;
  v_total_weight_kg NUMERIC;
  v_theoretical_quantity INT;
  v_efficiency_percentage NUMERIC;
  v_units_lost_to_cycle INT;
  v_counting_method TEXT;
  v_inner_id UUID;
  v_cap_template_id UUID;
BEGIN
  -- 1. Fetch Product & Machine Metadata
  SELECT 
    p.weight_grams, 
    p.raw_material_id, 
    p.counting_method,
    p.inner_id,
    p.cap_template_id,
    COALESCE(mp.ideal_cycle_time_seconds, 0)
  INTO 
    v_weight_grams, 
    v_raw_material_id, 
    v_counting_method,
    v_inner_id,
    v_cap_template_id,
    v_ideal_cycle_time
  FROM products p
  LEFT JOIN machine_products mp ON mp.product_id = p.id AND mp.machine_id = p_machine_id
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or not mapped to machine';
  END IF;

  -- 2. Calculate Actual Quantities
  IF v_counting_method = 'weight_based' THEN
    v_total_weight_kg := (p_total_produced * COALESCE(p_actual_weight_grams, v_weight_grams)) / 1000;
    v_actual_quantity := p_total_produced;
  ELSE
    v_actual_quantity := p_total_produced - COALESCE(p_damaged_count, 0);
  END IF;

  IF v_actual_quantity < 0 THEN
    RAISE EXCEPTION 'Actual quantity cannot be negative';
  END IF;

  -- 3. wastage and flagging
  v_weight_wastage_kg := (v_actual_quantity * (COALESCE(p_actual_weight_grams, v_weight_grams) - v_weight_grams)) / 1000;
  IF v_weight_wastage_kg < 0 THEN v_weight_wastage_kg := 0; END IF;

  v_flagged_for_review := v_ideal_cycle_time > 0 AND p_actual_cycle_time_seconds > (v_ideal_cycle_time * 1.05);

  -- 4. Raw Material consumption
  v_required_material_kg := (v_actual_quantity * v_weight_grams) / 1000;

  -- 5. VALIDATION: Check Raw Material Availability
  IF NOT EXISTS (SELECT 1 FROM raw_materials WHERE id = v_raw_material_id AND stock_weight_kg >= v_required_material_kg) THEN
    DECLARE
        v_available_rm NUMERIC;
    BEGIN
        SELECT stock_weight_kg INTO v_available_rm FROM raw_materials WHERE id = v_raw_material_id;
        RAISE EXCEPTION 'Insufficient raw material stock. Need %, have %', v_required_material_kg, v_available_rm;
    END;
  END IF;

  -- 6. Insert Log
  INSERT INTO production_logs (
    date, machine_id, product_id, user_id, factory_id,
    shift_number, start_time, end_time,
    total_produced, damaged_count, actual_quantity,
    total_weight_kg,
    actual_cycle_time_seconds, flagged_for_review,
    actual_weight_grams, weight_wastage_kg,
    downtime_minutes, downtime_reason,
    status,
    created_at
  ) VALUES (
    p_date, p_machine_id, p_product_id, p_user_id, p_factory_id,
    p_shift_number, p_start_time, p_end_time,
    p_total_produced, p_damaged_count, v_actual_quantity,
    v_total_weight_kg,
    p_actual_cycle_time_seconds, v_flagged_for_review,
    p_actual_weight_grams, v_weight_wastage_kg,
    p_downtime_minutes, p_downtime_reason,
    'submitted',
    NOW()
  ) RETURNING id INTO v_log_id;

  -- 7. Update Stocks
  UPDATE raw_materials 
  SET stock_weight_kg = stock_weight_kg - v_required_material_kg,
      updated_at = NOW()
  WHERE id = v_raw_material_id;

  INSERT INTO stock_balances (product_id, state, quantity, factory_id, unit_type, last_updated)
  VALUES (p_product_id, 'packed', v_actual_quantity, p_factory_id, '', NOW())
  ON CONFLICT (product_id, state, factory_id, COALESCE(cap_id, '00000000-0000-0000-0000-000000000000'), COALESCE(inner_id, '00000000-0000-0000-0000-000000000000'), unit_type) 
  DO UPDATE SET 
    quantity = stock_balances.quantity + EXCLUDED.quantity,
    last_updated = NOW();

  -- 8. Log Transactions
  INSERT INTO inventory_transactions (
    product_id, to_state, quantity, transaction_type, reference_id, factory_id, created_by
  ) VALUES (
    p_product_id, 'packed', v_actual_quantity, 'production', v_log_id, p_factory_id, p_user_id
  );

  INSERT INTO inventory_transactions (
    raw_material_id, from_state, quantity, transaction_type, reference_id, factory_id, created_by
  ) VALUES (
    v_raw_material_id, 'raw_material', v_required_material_kg, 'production_consumption', v_log_id, p_factory_id, p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'actual_quantity', v_actual_quantity,
    'material_consumed_kg', v_required_material_kg
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prepare_order_items_atomic(p_order_id uuid, p_items jsonb, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_item RECORD;
  v_source_state TEXT;
  v_factory_id UUID;
  v_updated_count INT := 0;
BEGIN
  -- Iterate over items to reserve
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
      -- 1. Fetch item details including inner requirement
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

      -- 2. Validation: Not exceeding total needed
      IF v_already_reserved + v_qty_to_reserve > v_total_needed THEN
        RAISE EXCEPTION 'Cannot reserve % units for item %. Total needed: %, already reserved: %', 
          v_qty_to_reserve, v_item.item_id, v_total_needed, v_already_reserved;
      END IF;

      -- 3. Validation: If backordered, ensure production request is 'prepared'
      IF v_is_backordered THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_prepared_qty_available
        FROM public.production_requests
        WHERE sales_order_id = p_order_id
          AND (product_id = v_product_id OR (product_id IS NULL AND v_product_id IS NULL))
          AND (cap_id = v_cap_id OR (cap_id IS NULL AND v_cap_id IS NULL))
          AND (inner_id = v_inner_id OR (inner_id IS NULL AND v_inner_id IS NULL))
          AND status = 'prepared'::production_request_status;

        -- Check if we have enough "prepared" signal to cover this reservation
        IF v_already_reserved + v_qty_to_reserve > v_prepared_qty_available THEN
          RAISE EXCEPTION 'Cannot reserve % units for backordered item %. Only % units have been marked as "Prepared" via production.', 
            v_qty_to_reserve, v_item.item_id, v_prepared_qty_available;
        END IF;
      END IF;

      -- 4. LOGIC BRANCH: Product vs Cap
      IF v_product_id IS NOT NULL THEN
        -- PRODUCT LOGIC
        SELECT factory_id INTO v_factory_id FROM public.products WHERE id = v_product_id;
        
        v_source_state := CASE v_unit_type
          WHEN 'loose' THEN 'semi_finished'
          WHEN 'packet' THEN 'packed'
          WHEN 'bundle' THEN 'finished'
          ELSE 'finished'
        END;

        -- Check Product Stock (respecting inner requirement)
        SELECT SUM(quantity) INTO v_available_stock 
        FROM public.stock_balances 
        WHERE product_id = v_product_id 
          AND state = v_source_state::inventory_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND (
            unit_type = v_unit_type 
            OR (v_unit_type = 'loose' AND unit_type = '')
          )
          AND (
            (v_include_inner = TRUE AND inner_id = v_inner_id) OR
            (COALESCE(v_include_inner, FALSE) = FALSE AND inner_id IS NULL)
          );
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for product %. Required: %, Available: % in %', 
             v_product_id, v_qty_to_reserve, COALESCE(v_available_stock, 0), v_source_state;
        END IF;

        -- Reserve Product Stock
        FOR v_balance IN 
          SELECT id, quantity, cap_id, inner_id, unit_type 
          FROM public.stock_balances 
          WHERE product_id = v_product_id 
            AND state = v_source_state::inventory_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND (
              unit_type = v_unit_type 
              OR (v_unit_type = 'loose' AND unit_type = '')
            )
            AND (
              (v_include_inner = TRUE AND inner_id = v_inner_id) OR
              (COALESCE(v_include_inner, FALSE) = FALSE AND inner_id IS NULL)
            )
            AND quantity > 0
          ORDER BY (unit_type = v_unit_type) DESC, quantity DESC -- Prefer exact match
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            -- Insert into reserved using the requested v_unit_type
            INSERT INTO public.stock_balances (product_id, factory_id, state, quantity, cap_id, inner_id, unit_type, last_updated)
            VALUES (v_product_id, v_factory_id, 'reserved'::inventory_state, v_deduct_qty, v_balance.cap_id, v_balance.inner_id, v_unit_type, NOW())
            ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
            DO UPDATE SET 
              quantity = stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;

      ELSIF v_cap_id IS NOT NULL THEN
        -- CAP LOGIC (No inner requirement for caps)
        SELECT factory_id INTO v_factory_id FROM public.caps WHERE id = v_cap_id;
        v_source_state := 'finished';

        -- Check Cap Stock
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

        -- Reserve Cap Stock
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
            UPDATE public.cap_stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            INSERT INTO public.cap_stock_balances (cap_id, factory_id, state, quantity, unit_type, last_updated)
            VALUES (v_cap_id, v_factory_id, 'reserved', v_deduct_qty, COALESCE(v_unit_type, 'loose'), NOW())
            ON CONFLICT (cap_id, factory_id, state, unit_type) 
            DO UPDATE SET 
              quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;
      END IF;

      -- 5. Update the Sales Order Item Status
      UPDATE public.sales_order_items 
      SET 
        quantity_reserved = quantity_reserved + v_item.quantity,
        quantity_prepared = quantity_prepared + v_item.quantity, -- FIXED: Increment quantity_prepared too!
        is_prepared = (quantity_reserved + v_item.quantity >= quantity),
        prepared_at = CASE WHEN (quantity_reserved + v_item.quantity >= quantity) THEN NOW() ELSE prepared_at END
      WHERE id = v_item.item_id;

      -- 6. Log Transaction
      INSERT INTO public.inventory_transactions (
        product_id, cap_id, from_state, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type
      ) VALUES (
        v_product_id, v_cap_id, v_source_state::inventory_state, 'reserved'::inventory_state, v_item.quantity, 'reserve', p_order_id, v_factory_id, p_user_id, v_unit_type
      );

      v_updated_count := v_updated_count + 1;
    END;
  END LOOP;

  -- 7. Update Sales Order Status to 'reserved' if all items are fully reserved
  IF NOT EXISTS (SELECT 1 FROM public.sales_order_items WHERE order_id = p_order_id AND quantity_reserved < quantity) THEN
    UPDATE public.sales_orders SET status = 'reserved', updated_at = NOW() WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'reserved_count', v_updated_count);
END;
$function$
;

DROP FUNCTION IF EXISTS public.adjust_cap_stock(uuid, uuid, numeric, text, text);
CREATE OR REPLACE FUNCTION public.adjust_cap_stock(p_cap_id uuid, p_factory_id uuid, p_quantity_change numeric, p_state text DEFAULT 'finished'::text, p_unit_type text DEFAULT 'loose'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type, last_updated)
    VALUES (p_cap_id, p_factory_id, p_quantity_change, p_state, p_unit_type, now())
    ON CONFLICT (cap_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
        last_updated = now();
END;
$function$
;

DROP FUNCTION IF EXISTS public.process_partial_dispatch(uuid, jsonb, text, numeric, text, date, numeric, text, uuid, text);
CREATE OR REPLACE FUNCTION public.process_partial_dispatch(p_order_id uuid, p_items jsonb, p_discount_type text, p_discount_value numeric, p_payment_mode text, p_credit_deadline date, p_initial_payment numeric, p_notes text, p_user_id uuid, p_payment_method text DEFAULT 'cash'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_dispatch_id UUID;
    v_payment_id UUID;
    v_subtotal NUMERIC := 0;
    v_batch_discount NUMERIC := 0;
    v_batch_total NUMERIC;
    v_item RECORD;
    v_current_item RECORD;
    v_customer_id UUID;
    v_balance RECORD;
    v_new_total_amount NUMERIC;
    v_new_amount_paid NUMERIC;
BEGIN
    SELECT customer_id INTO v_customer_id FROM public.sales_orders WHERE id = p_order_id;
    IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Order % not found', p_order_id; END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INTEGER, unit_price NUMERIC) LOOP
        v_subtotal := v_subtotal + (v_item.quantity * v_item.unit_price);
    END LOOP;

    IF p_discount_type = 'percentage' THEN v_batch_discount := (v_subtotal * COALESCE(p_discount_value, 0)) / 100;
    ELSE v_batch_discount := COALESCE(p_discount_value, 0); END IF;
    v_batch_total := v_subtotal - v_batch_discount;

    INSERT INTO public.dispatch_records (
        order_id, subtotal, discount_value, total_amount, recorded_by, notes
    ) VALUES (
        p_order_id, v_subtotal, v_batch_discount, v_batch_total, p_user_id, p_notes
    ) RETURNING id INTO v_dispatch_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INTEGER, unit_price NUMERIC) LOOP
        DECLARE v_remaining_to_dispatch INT := v_item.quantity;
        BEGIN
            SELECT soi.product_id, soi.cap_id, soi.unit_type, soi.quantity_shipped, 
                   soi.quantity_reserved, COALESCE(p.factory_id, c.factory_id) as factory_id, soi.quantity as target_qty
            INTO v_current_item FROM public.sales_order_items soi
            LEFT JOIN public.products p ON p.id = soi.product_id
            LEFT JOIN public.caps c ON c.id = soi.cap_id WHERE soi.id = v_item.item_id;

            IF v_item.quantity > (v_current_item.quantity_reserved - v_current_item.quantity_shipped) THEN
                RAISE EXCEPTION 'Cannot dispatch % for item %. Only % reserved.', v_item.quantity, v_item.item_id, (v_current_item.quantity_reserved - v_current_item.quantity_shipped);
            END IF;

            UPDATE public.sales_order_items SET quantity_shipped = quantity_shipped + v_item.quantity, 
                   unit_price = v_item.unit_price, is_prepared = (quantity_shipped + v_item.quantity) >= v_current_item.target_qty
            WHERE id = v_item.item_id;

            INSERT INTO public.dispatch_items (dispatch_id, sales_order_item_id, quantity_shipped)
            VALUES (v_dispatch_id, v_item.item_id, v_item.quantity);

            IF v_current_item.cap_id IS NOT NULL THEN
                FOR v_balance IN SELECT id, quantity FROM public.cap_stock_balances 
                    WHERE cap_id = v_current_item.cap_id AND state = 'reserved' 
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, 'loose') AND quantity > 0 ORDER BY quantity DESC LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    UPDATE public.cap_stock_balances SET quantity = quantity - LEAST(v_remaining_to_dispatch, v_balance.quantity), last_updated = NOW() WHERE id = v_balance.id;
                    v_remaining_to_dispatch := v_remaining_to_dispatch - LEAST(v_remaining_to_dispatch, v_balance.quantity);
                END LOOP;
            ELSE
                FOR v_balance IN SELECT id, quantity FROM public.stock_balances 
                    WHERE product_id = v_current_item.product_id AND state = 'reserved' 
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, '') AND quantity > 0 ORDER BY quantity DESC LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    UPDATE public.stock_balances SET quantity = quantity - LEAST(v_remaining_to_dispatch, v_balance.quantity), last_updated = NOW() WHERE id = v_balance.id;
                    v_remaining_to_dispatch := v_remaining_to_dispatch - LEAST(v_remaining_to_dispatch, v_balance.quantity);
                END LOOP;
            END IF;
        END;
    END LOOP;

    IF COALESCE(p_initial_payment, 0) > 0 THEN
        INSERT INTO public.payments (sales_order_id, customer_id, amount, payment_method, notes, recorded_by
        ) VALUES (p_order_id, v_customer_id, p_initial_payment, COALESCE(p_payment_method, 'cash'), 
                  'Initial payment for dispatch ' || v_dispatch_id, p_user_id) RETURNING id INTO v_payment_id;
    END IF;

    UPDATE public.sales_orders SET amount_paid = amount_paid + COALESCE(p_initial_payment, 0),
           payment_mode = COALESCE(p_payment_mode, payment_mode), credit_deadline = COALESCE(p_credit_deadline, credit_deadline),
           status = CASE WHEN (SELECT EVERY(quantity_shipped >= quantity) FROM public.sales_order_items WHERE order_id = p_order_id) THEN 'delivered' ELSE 'partially_delivered' END,
           updated_at = now() WHERE id = p_order_id RETURNING amount_paid, total_amount INTO v_new_amount_paid, v_new_total_amount;

    UPDATE public.sales_orders SET balance_due = v_new_total_amount - v_new_amount_paid WHERE id = p_order_id;
    UPDATE public.customers SET balance_due = (SELECT SUM(balance_due) FROM public.sales_orders WHERE customer_id = v_customer_id AND status != 'cancelled') WHERE id = v_customer_id;

    RETURN jsonb_build_object('dispatch_id', v_dispatch_id, 'payment_id', v_payment_id, 'batch_total', v_batch_total, 'order_id', p_order_id);
END;
$function$
;

DROP FUNCTION IF EXISTS public.submit_production_atomic(uuid, uuid, integer, time without time zone, time without time zone, integer, integer, numeric, numeric, integer, text, date, uuid, uuid, integer, numeric, boolean, numeric);
CREATE OR REPLACE FUNCTION public.submit_production_atomic(p_machine_id uuid, p_product_id uuid, p_shift_number integer, p_start_time time without time zone, p_end_time time without time zone, p_total_produced integer, p_damaged_count integer, p_actual_cycle_time_seconds numeric, p_actual_weight_grams numeric, p_downtime_minutes integer, p_downtime_reason text, p_date date, p_user_id uuid, p_factory_id uuid, p_theoretical_quantity integer DEFAULT 0, p_efficiency_percentage numeric DEFAULT 0, p_is_cost_recovered boolean DEFAULT true, p_shift_hours numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_log_id UUID;
  v_actual_quantity INT;
  v_weight_grams NUMERIC;
  v_raw_material_id UUID;
  v_weight_wastage_kg NUMERIC;
  v_flagged_for_review BOOLEAN;
  v_required_material_kg NUMERIC;
  v_color TEXT;
  v_cap_template_id UUID;
  v_inner_id UUID;
  v_cap_id UUID;
  v_ideal_cycle_time NUMERIC;
  v_template_id UUID;
  v_target_state inventory_state := 'semi_finished'::inventory_state;
  v_target_unit_type TEXT := 'loose';
BEGIN
  -- 1. Fetch Metadata
  SELECT 
    p.weight_grams, p.raw_material_id, p.color, p.inner_id, p.cap_template_id, p.template_id
  INTO 
    v_weight_grams, v_raw_material_id, v_color, v_inner_id, v_cap_template_id, v_template_id
  FROM products p 
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Fetch Machine-Product Mapping
  SELECT COALESCE(ideal_cycle_time_seconds, 0)
  INTO v_ideal_cycle_time
  FROM machine_products 
  WHERE machine_id = p_machine_id 
    AND (product_template_id = v_template_id OR product_id = p_product_id)
  ORDER BY (product_template_id IS NOT NULL) DESC 
  LIMIT 1;

  v_actual_quantity := COALESCE(p_total_produced, 0) - COALESCE(p_damaged_count, 0);
  
  -- 2. Calculations
  v_weight_wastage_kg := (v_actual_quantity * (COALESCE(p_actual_weight_grams, v_weight_grams) - v_weight_grams)) / 1000;
  IF v_weight_wastage_kg < 0 THEN v_weight_wastage_kg := 0; END IF;
  
  v_flagged_for_review := v_ideal_cycle_time > 0 AND p_actual_cycle_time_seconds > (v_ideal_cycle_time * 1.05);

  -- 3. Raw Material consumption (includes wastage)
  v_required_material_kg := (v_actual_quantity * v_weight_grams) / 1000 + v_weight_wastage_kg;

  -- 4. VALIDATION: Check Raw Material Availability
  IF NOT EXISTS (SELECT 1 FROM raw_materials WHERE id = v_raw_material_id AND stock_weight_kg >= v_required_material_kg) THEN
    DECLARE v_available_rm NUMERIC;
    BEGIN
        SELECT stock_weight_kg INTO v_available_rm FROM raw_materials WHERE id = v_raw_material_id;
        RAISE EXCEPTION 'Insufficient raw material stock. Need %, have %', v_required_material_kg, v_available_rm;
    END;
  END IF;

  -- 5. Insert Log
  INSERT INTO production_logs (
    date, machine_id, product_id, user_id, factory_id,
    shift_number, start_time, end_time,
    total_produced, damaged_count, actual_quantity,
    actual_cycle_time_seconds, flagged_for_review,
    actual_weight_grams, weight_wastage_kg, total_weight_kg,
    downtime_minutes, downtime_reason,
    theoretical_quantity, efficiency_percentage, is_cost_recovered, shift_hours,
    status, created_at
  ) VALUES (
    p_date, p_machine_id, p_product_id, p_user_id, p_factory_id,
    p_shift_number, p_start_time, p_end_time,
    p_total_produced, p_damaged_count, v_actual_quantity,
    p_actual_cycle_time_seconds, v_flagged_for_review,
    p_actual_weight_grams, v_weight_wastage_kg, v_required_material_kg,
    p_downtime_minutes, p_downtime_reason,
    p_theoretical_quantity, p_efficiency_percentage, p_is_cost_recovered, p_shift_hours,
    'submitted', NOW()
  ) RETURNING id INTO v_log_id;

  -- 6. Update Stocks (Molding -> semi_finished/loose)
  INSERT INTO stock_balances (product_id, state, quantity, factory_id, unit_type, cap_id, inner_id, last_updated)
  VALUES (p_product_id, v_target_state, v_actual_quantity, p_factory_id, v_target_unit_type, NULL, v_inner_id, NOW())
  ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
  DO UPDATE SET 
    quantity = stock_balances.quantity + EXCLUDED.quantity, last_updated = NOW();

  -- Raw Material Stock
  UPDATE raw_materials SET stock_weight_kg = stock_weight_kg - v_required_material_kg, updated_at = NOW() WHERE id = v_raw_material_id;

  -- 7. Log Inventory Transactions
  INSERT INTO inventory_transactions (product_id, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type)
  VALUES (p_product_id, v_target_state, v_actual_quantity, 'production', v_log_id, p_factory_id, p_user_id, v_target_unit_type);

  INSERT INTO inventory_transactions (raw_material_id, from_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type)
  VALUES (v_raw_material_id, 'raw_material', v_required_material_kg, 'production_consumption', v_log_id, p_factory_id, p_user_id, 'kg');

  RETURN jsonb_build_object(
    'success', true, 
    'log_id', v_log_id,
    'actual_quantity', v_actual_quantity,
    'weight_wastage_kg', v_weight_wastage_kg,
    'total_weight_kg', v_required_material_kg
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_order_atomic(p_customer_id uuid, p_delivery_date text, p_notes text, p_user_id uuid, p_items jsonb, p_order_date text)
 RETURNS jsonb
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
    -- 1. Pre-calculate total amount and validate pricing
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
            -- Fetch product details including template and default inner
            SELECT p.selling_price, p.factory_id, p.inner_id, pt.inner_template_id
            INTO v_resource_data
            FROM public.products p
            LEFT JOIN public.product_templates pt ON p.template_id = pt.id
            WHERE p.id = v_item.product_id;

            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);
            
            -- Determine target inner if requested
            v_target_inner_id := NULL;
            IF v_item.include_inner = TRUE THEN
                v_target_inner_id := v_resource_data.inner_id;
            END IF;

            -- Stock availability check (must factor in the inner requirement)
            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.stock_balances 
            WHERE product_id = v_item.product_id 
              AND unit_type = COALESCE(v_item.unit_type, 'bundle')
              AND state IN ('semi_finished', 'packed', 'finished')
              AND (factory_id = v_factory_id OR factory_id IS NULL)
              AND (
                  (COALESCE(v_item.include_inner, FALSE) = TRUE AND inner_id = v_target_inner_id) OR
                  (COALESCE(v_item.include_inner, FALSE) = FALSE AND inner_id IS NULL)
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

            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.cap_stock_balances 
            WHERE cap_id = v_item.cap_id 
              AND unit_type = COALESCE(v_item.unit_type, 'loose')
              AND state IN ('finished')
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
$function$
;

