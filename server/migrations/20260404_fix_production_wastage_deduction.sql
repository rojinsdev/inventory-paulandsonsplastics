-- Migration: Fix Production Wastage RM Deduction & Template Alignment (Fixing Conflict Index & Storing Total Weight)
-- Created: 2026-04-04

CREATE OR REPLACE FUNCTION public.submit_production_atomic(
  p_machine_id uuid,
  p_product_id uuid,
  p_shift_number integer,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_total_produced integer,
  p_damaged_count integer,
  p_actual_cycle_time_seconds numeric,
  p_actual_weight_grams numeric,
  p_downtime_minutes integer,
  p_downtime_reason text,
  p_date date,
  p_user_id uuid,
  p_factory_id uuid,
  p_theoretical_quantity integer DEFAULT 0,
  p_efficiency_percentage numeric DEFAULT 0,
  p_is_cost_recovered boolean DEFAULT true,
  p_shift_hours numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
BEGIN
  -- 1. Fetch Metadata (Include template_id for machine mapping)
  SELECT 
    p.weight_grams, p.raw_material_id, p.color, p.inner_id, p.cap_template_id, p.template_id
  INTO 
    v_weight_grams, v_raw_material_id, v_color, v_inner_id, v_cap_template_id, v_template_id
  FROM products p 
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Fetch Machine-Product Mapping (Using template_id as per Migration 022)
  SELECT COALESCE(ideal_cycle_time_seconds, 0)
  INTO v_ideal_cycle_time
  FROM machine_products 
  WHERE machine_id = p_machine_id 
    AND (product_template_id = v_template_id OR product_id = p_product_id)
  ORDER BY (product_template_id IS NOT NULL) DESC 
  LIMIT 1;

  v_actual_quantity := p_total_produced - COALESCE(p_damaged_count, 0);
  
  -- 2. Calculations
  -- Calculate wastage weight: (actual - ideal) * quantity / 1000
  v_weight_wastage_kg := (v_actual_quantity * (COALESCE(p_actual_weight_grams, v_weight_grams) - v_weight_grams)) / 1000;
  IF v_weight_wastage_kg < 0 THEN v_weight_wastage_kg := 0; END IF;
  
  v_flagged_for_review := v_ideal_cycle_time > 0 AND p_actual_cycle_time_seconds > (v_ideal_cycle_time * 1.05);

  -- 3. Raw Material consumption (FIXED: Now includes wastage weight)
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

  -- 6. Update Stocks
  INSERT INTO stock_balances (product_id, state, quantity, factory_id, unit_type, cap_id, inner_id, last_updated)
  VALUES (p_product_id, 'packed', v_actual_quantity, p_factory_id, '', NULL, v_inner_id, NOW())
  ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
  DO UPDATE SET 
    quantity = stock_balances.quantity + EXCLUDED.quantity, last_updated = NOW();

  -- Raw Material Stock
  UPDATE raw_materials SET stock_weight_kg = stock_weight_kg - v_required_material_kg, updated_at = NOW() WHERE id = v_raw_material_id;

  -- 7. Log Inventory Transactions
  INSERT INTO inventory_transactions (product_id, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type)
  VALUES (p_product_id, 'packed', v_actual_quantity, 'production', v_log_id, p_factory_id, p_user_id, '');

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
$$;
