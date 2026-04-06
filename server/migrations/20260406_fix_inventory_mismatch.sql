-- Migration: Fix Inventory Type Mismatch
-- Created: 2026-04-06

-- 1. Update submit_production_atomic (18-arg version)
CREATE OR REPLACE FUNCTION public.submit_production_atomic(
  p_machine_id uuid, p_product_id uuid, p_shift_number integer, 
  p_start_time time without time zone, p_end_time time without time zone, 
  p_total_produced integer, p_damaged_count integer, 
  p_actual_cycle_time_seconds numeric, p_actual_weight_grams numeric, 
  p_downtime_minutes integer, p_downtime_reason text, p_date date, 
  p_user_id uuid, p_factory_id uuid, 
  p_theoretical_quantity integer DEFAULT 0, p_efficiency_percentage numeric DEFAULT 0, 
  p_is_cost_recovered boolean DEFAULT true, p_shift_hours numeric DEFAULT 0
)
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

  v_actual_quantity := p_total_produced - COALESCE(p_damaged_count, 0);
  
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
$function$;

-- 2. Update prepare_order_items_atomic to handle empty strings as synonym for loose
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
      -- 1. Fetch item details
      SELECT 
        soi.product_id, soi.cap_id, soi.unit_type, soi.quantity, 
        COALESCE(soi.quantity_reserved, 0), soi.is_backordered
      INTO 
        v_product_id, v_cap_id, v_unit_type, v_total_needed, 
        v_already_reserved, v_is_backordered
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

        -- Check Product Stock - UPDATED to handle '' as fallback for 'loose'
        SELECT SUM(quantity) INTO v_available_stock 
        FROM public.stock_balances 
        WHERE product_id = v_product_id 
          AND state = v_source_state::inventory_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND (
            unit_type = v_unit_type 
            OR (v_unit_type = 'loose' AND unit_type = '')
          );
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for product %. Required: %, Available: % in %', 
             v_product_id, v_qty_to_reserve, COALESCE(v_available_stock, 0), v_source_state;
        END IF;

        -- Reserve Product Stock
        FOR v_balance IN 
          SELECT id, quantity, cap_id, inner_id, unit_type -- Select unit_type to preserve it
          FROM public.stock_balances 
          WHERE product_id = v_product_id 
            AND state = v_source_state::inventory_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND (
              unit_type = v_unit_type 
              OR (v_unit_type = 'loose' AND unit_type = '')
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
        LOOP;

      ELSIF v_cap_id IS NOT NULL THEN
        -- CAP LOGIC
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
        LOOP;
      END IF;

      -- 5. Update the Sales Order Item Status
      UPDATE public.sales_order_items 
      SET 
        quantity_reserved = quantity_reserved + v_item.quantity,
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
$function$;

-- 3. Data Migration: Align existing 'semi_finished' stock to 'loose' unit_type
UPDATE public.stock_balances 
SET unit_type = 'loose' 
WHERE state = 'semi_finished' AND (unit_type = '' OR unit_type IS NULL);

UPDATE public.cap_stock_balances 
SET unit_type = 'loose' 
WHERE (unit_type = '' OR unit_type IS NULL);

UPDATE public.inventory_transactions 
SET unit_type = 'loose' 
WHERE to_state = 'semi_finished' AND (unit_type = '' OR unit_type IS NULL);
