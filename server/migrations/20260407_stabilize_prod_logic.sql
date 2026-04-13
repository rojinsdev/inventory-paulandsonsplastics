-- Migration: Stabilize Production Logic and Harmonize Schema
-- Date: 2026-04-07
-- Description: Fixes state mismatch in production vs reservation and ensures updated_at is used everywhere.

-- 1. DATA FIX: Move misplaced 'loose' stock from 'packed' to 'semi_finished'
DO $$
BEGIN
    INSERT INTO public.stock_balances (product_id, state, quantity, factory_id, unit_type, cap_id, inner_id, updated_at)
    SELECT product_id, 'semi_finished'::inventory_state, quantity, factory_id, unit_type, cap_id, inner_id, NOW()
    FROM public.stock_balances
    WHERE state = 'packed'::inventory_state AND unit_type = 'loose'
    ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
    DO UPDATE SET 
        quantity = stock_balances.quantity + EXCLUDED.quantity,
        updated_at = NOW();

    DELETE FROM public.stock_balances WHERE state = 'packed'::inventory_state AND unit_type = 'loose';
    
    UPDATE public.inventory_transactions SET to_state = 'semi_finished'::inventory_state 
    WHERE to_state = 'packed'::inventory_state AND unit_type = 'loose' AND transaction_type = 'production';
END $$;

-- 2. UPDATE submit_production_atomic
CREATE OR REPLACE FUNCTION public.submit_production_atomic(
    p_date date, 
    p_machine_id uuid, 
    p_product_id uuid, 
    p_user_id uuid, 
    p_factory_id uuid, 
    p_shift_number integer, 
    p_start_time time without time zone, 
    p_end_time time without time zone, 
    p_total_produced integer, 
    p_damaged_count integer, 
    p_actual_cycle_time_seconds numeric, 
    p_actual_weight_grams numeric, 
    p_downtime_minutes integer, 
    p_downtime_reason text, 
    p_theoretical_quantity integer DEFAULT 0, 
    p_efficiency_percentage numeric DEFAULT 0, 
    p_is_cost_recovered boolean DEFAULT true, 
    p_shift_hours numeric DEFAULT 8
)
 RETURNS jsonb
 LANGUAGE plpgsql
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
  v_ideal_cycle_time NUMERIC;
  v_template_id UUID;
  v_unit_type TEXT := 'loose';
  v_target_state inventory_state := 'semi_finished';
BEGIN
  SELECT p.weight_grams, p.raw_material_id, p.color, p.inner_id, p.cap_template_id, p.template_id
  INTO v_weight_grams, v_raw_material_id, v_color, v_inner_id, v_cap_template_id, v_template_id
  FROM public.products p WHERE p.id = p_product_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  SELECT COALESCE(ideal_cycle_time_seconds, 0) INTO v_ideal_cycle_time
  FROM public.machine_products WHERE machine_id = p_machine_id 
    AND (product_template_id = v_template_id OR product_id = p_product_id)
  ORDER BY (product_template_id IS NOT NULL) DESC LIMIT 1;

  v_actual_quantity := p_total_produced - COALESCE(p_damaged_count, 0);
  v_weight_wastage_kg := (v_actual_quantity * (COALESCE(p_actual_weight_grams, v_weight_grams) - v_weight_grams)) / 1000;
  IF v_weight_wastage_kg < 0 THEN v_weight_wastage_kg := 0; END IF;
  v_flagged_for_review := v_ideal_cycle_time > 0 AND p_actual_cycle_time_seconds > (v_ideal_cycle_time * 1.05);

  v_required_material_kg := (v_actual_quantity * v_weight_grams) / 1000 + v_weight_wastage_kg;

  IF NOT EXISTS (SELECT 1 FROM public.raw_materials WHERE id = v_raw_material_id AND stock_weight_kg >= v_required_material_kg) THEN
    RAISE EXCEPTION 'Insufficient raw material stock';
  END IF;

  INSERT INTO public.production_logs (
    date, machine_id, product_id, user_id, factory_id, shift_number, start_time, end_time,
    total_produced, damaged_count, actual_quantity, actual_cycle_time_seconds, flagged_for_review,
    actual_weight_grams, weight_wastage_kg, total_weight_kg, downtime_minutes, downtime_reason,
    theoretical_quantity, efficiency_percentage, is_cost_recovered, shift_hours, status, created_at, updated_at
  ) VALUES (
    p_date, p_machine_id, p_product_id, p_user_id, p_factory_id, p_shift_number, p_start_time, p_end_time,
    p_total_produced, p_damaged_count, v_actual_quantity, p_actual_cycle_time_seconds, v_flagged_for_review,
    p_actual_weight_grams, v_weight_wastage_kg, v_required_material_kg, p_downtime_minutes, p_downtime_reason,
    p_theoretical_quantity, p_efficiency_percentage, p_is_cost_recovered, p_shift_hours, 'submitted', NOW(), NOW()
  ) RETURNING id INTO v_log_id;

  INSERT INTO public.stock_balances (product_id, state, quantity, factory_id, unit_type, cap_id, inner_id, updated_at)
  VALUES (p_product_id, v_target_state, v_actual_quantity, p_factory_id, v_unit_type, NULL, v_inner_id, NOW())
  ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
  DO UPDATE SET 
    quantity = stock_balances.quantity + EXCLUDED.quantity, 
    updated_at = NOW();

  UPDATE public.raw_materials 
  SET stock_weight_kg = stock_weight_kg - v_required_material_kg, 
      updated_at = NOW() 
  WHERE id = v_raw_material_id;

  INSERT INTO public.inventory_transactions (
    product_id, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type, created_at
  ) VALUES (
    p_product_id, v_target_state, v_actual_quantity, 'production', v_log_id, p_factory_id, p_user_id, v_unit_type, NOW()
  );

  INSERT INTO public.inventory_transactions (
    raw_material_id, from_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type, created_at
  ) VALUES (
    v_raw_material_id, 'raw_material', v_required_material_kg, 'production_consumption', v_log_id, p_factory_id, p_user_id, 'kg', NOW()
  );

  RETURN jsonb_build_object('success', true, 'log_id', v_log_id);
END;
$function$;

-- 3. Update prepare_order_items_atomic
CREATE OR REPLACE FUNCTION public.prepare_order_items_atomic(p_order_id uuid, p_items jsonb, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
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
          AND status = 'prepared'::production_request_status;

        IF v_already_reserved + v_qty_to_reserve > v_prepared_qty_available THEN
          RAISE EXCEPTION 'Cannot reserve % units for item %. Only % units marked as Prepared.', 
            v_qty_to_reserve, v_item.item_id, v_prepared_qty_available;
        END IF;
      END IF;

      v_source_state := CASE v_unit_type
        WHEN 'loose' THEN 'semi_finished'
        WHEN 'packet' THEN 'packed'
        WHEN 'bundle' THEN 'finished'
        ELSE 'finished'
      END;

      IF v_product_id IS NOT NULL THEN
        SELECT factory_id INTO v_factory_id FROM public.products WHERE id = v_product_id;
        
        SELECT SUM(quantity) INTO v_available_stock 
        FROM public.stock_balances 
        WHERE product_id = v_product_id AND state = v_source_state::inventory_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND (unit_type = v_unit_type OR (v_unit_type = 'loose' AND unit_type = ''))
          AND (
            (v_include_inner = TRUE AND inner_id = v_inner_id) OR
            (COALESCE(v_include_inner, FALSE) = FALSE AND inner_id IS NULL)
          );

        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
          RAISE EXCEPTION 'Insufficient stock for product %. Need %, Have % in %', v_product_id, v_qty_to_reserve, COALESCE(v_available_stock, 0), v_source_state;
        END IF;

        FOR v_balance IN 
          SELECT id, quantity, cap_id, inner_id 
          FROM public.stock_balances 
          WHERE product_id = v_product_id AND state = v_source_state::inventory_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND (unit_type = v_unit_type OR (v_unit_type = 'loose' AND unit_type = ''))
            AND (
              (v_include_inner = TRUE AND inner_id = v_inner_id) OR
              (COALESCE(v_include_inner, FALSE) = FALSE AND inner_id IS NULL)
            ) AND quantity > 0 ORDER BY quantity DESC 
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.stock_balances SET quantity = quantity - v_deduct_qty, updated_at = NOW() WHERE id = v_balance.id;
            
            INSERT INTO public.stock_balances (product_id, factory_id, state, quantity, cap_id, inner_id, unit_type, updated_at)
            VALUES (v_product_id, v_factory_id, 'reserved', v_deduct_qty, v_balance.cap_id, v_balance.inner_id, v_unit_type, NOW())
            ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
            DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();
            
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;
      END IF;

      UPDATE public.sales_order_items SET 
        quantity_reserved = COALESCE(quantity_reserved, 0) + v_item.quantity,
        is_prepared = (COALESCE(quantity_reserved, 0) + v_item.quantity) >= quantity,
        prepared_at = NOW(),
        prepared_by = p_user_id
      WHERE id = v_item.item_id;

      v_updated_count := v_updated_count + 1;
    END;
  END LOOP;

  IF v_updated_count > 0 THEN
    UPDATE public.sales_orders SET status = 'reserved', updated_at = NOW() WHERE id = p_order_id AND status != 'delivered';
  END IF;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated_count);
END;
$function$;
