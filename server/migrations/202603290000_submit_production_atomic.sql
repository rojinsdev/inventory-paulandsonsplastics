-- Migration: submit_production_atomic
-- Created: 2026-03-29
-- Description: Refactors submitProduction into an atomic database operation.

CREATE OR REPLACE FUNCTION submit_production_atomic(
  p_machine_id UUID,
  p_product_id UUID,
  p_shift_number INT,
  p_start_time TIME,
  p_end_time TIME,
  p_total_produced INT,
  p_damaged_count INT,
  p_actual_cycle_time_seconds NUMERIC,
  p_actual_weight_grams NUMERIC,
  p_downtime_minutes INT,
  p_downtime_reason TEXT,
  p_date DATE,
  p_user_id UUID,
  p_factory_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_log_id UUID;
  v_actual_quantity INT;
  v_weight_grams NUMERIC;
  v_raw_material_id UUID;
  v_ideal_cycle_time NUMERIC;
  v_weight_wastage_kg NUMERIC;
  v_flagged_for_review BOOLEAN;
  v_required_material_kg NUMERIC;
  v_total_weight_kg NUMERIC; -- Only for weight-based products
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
    -- For caps, total_weight_kg is usually provided in the request
    -- But since this RPC is generic, we can calculate if weights are provided
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
    -- Fetch available stock for detail
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
  -- Raw Material
  UPDATE raw_materials 
  SET stock_weight_kg = stock_weight_kg - v_required_material_kg,
      updated_at = NOW()
  WHERE id = v_raw_material_id;

  -- Finished Product
  INSERT INTO stock_balances (product_id, state, quantity, factory_id, unit_type, last_updated)
  VALUES (p_product_id, 'packed', v_actual_quantity, p_factory_id, '', NOW())
  ON CONFLICT (product_id, state, factory_id, cap_id, inner_id, unit_type) 
  DO UPDATE SET 
    quantity = stock_balances.quantity + EXCLUDED.quantity,
    last_updated = NOW();

  -- 8. Log Transactions
  -- Product
  INSERT INTO inventory_transactions (
    product_id, to_state, quantity, transaction_type, reference_id, factory_id, created_by
  ) VALUES (
    p_product_id, 'packed', v_actual_quantity, 'production', v_log_id, p_factory_id, p_user_id
  );

  -- Raw Material
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
$$ LANGUAGE plpgsql;
