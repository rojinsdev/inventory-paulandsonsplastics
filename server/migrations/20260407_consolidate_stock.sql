-- 20260407_consolidate_stock.sql
-- Goal: Merge duplicate stock rows and enforce strict unique constraints

BEGIN;

-- 1. Standardize unit_type in stock_balances
UPDATE public.stock_balances SET unit_type = 'loose' WHERE unit_type = '' OR unit_type IS NULL;
UPDATE public.inner_stock_balances SET unit_type = 'loose' WHERE unit_type = '' OR unit_type IS NULL OR unit_type = 'units';
UPDATE public.cap_stock_balances SET unit_type = 'loose' WHERE unit_type = '' OR unit_type IS NULL;

-- 2. Consolidate stock_balances (Tubs/Products)
CREATE TEMP TABLE tmp_stock_balances AS
SELECT 
    product_id, factory_id, state, unit_type, 
    COALESCE(cap_id, '00000000-0000-0000-0000-000000000000'::uuid) as cap_id, 
    COALESCE(inner_id, '00000000-0000-0000-0000-000000000000'::uuid) as inner_id,
    SUM(quantity) as quantity,
    MAX(last_updated) as last_updated
FROM public.stock_balances
GROUP BY product_id, factory_id, state, unit_type, 5, 6;

TRUNCATE public.stock_balances RESTART IDENTITY;

INSERT INTO public.stock_balances (product_id, factory_id, state, unit_type, cap_id, inner_id, quantity, last_updated)
SELECT 
    product_id, factory_id, state, unit_type, 
    CASE WHEN cap_id = '00000000-0000-0000-0000-000000000000'::uuid THEN NULL ELSE cap_id END,
    CASE WHEN inner_id = '00000000-0000-0000-0000-000000000000'::uuid THEN NULL ELSE inner_id END,
    quantity, last_updated
FROM tmp_stock_balances;

-- 3. Consolidate inner_stock_balances
CREATE TEMP TABLE tmp_inner_stock_balances AS
SELECT 
    inner_id, factory_id, state, unit_type,
    SUM(quantity) as quantity,
    MAX(last_updated) as last_updated
FROM public.inner_stock_balances
GROUP BY inner_id, factory_id, state, unit_type;

TRUNCATE public.inner_stock_balances RESTART IDENTITY;

INSERT INTO public.inner_stock_balances (inner_id, factory_id, state, unit_type, quantity, last_updated)
SELECT inner_id, factory_id, state, unit_type, quantity, last_updated
FROM tmp_inner_stock_balances;

-- 4. Consolidate cap_stock_balances
CREATE TEMP TABLE tmp_cap_stock_balances AS
SELECT 
    cap_id, factory_id, state, unit_type,
    SUM(quantity) as quantity,
    MAX(last_updated) as last_updated
FROM public.cap_stock_balances
GROUP BY cap_id, factory_id, state, unit_type;

TRUNCATE public.cap_stock_balances RESTART IDENTITY;

INSERT INTO public.cap_stock_balances (cap_id, factory_id, state, unit_type, quantity, last_updated)
SELECT cap_id, factory_id, state, unit_type, quantity, last_updated
FROM tmp_cap_stock_balances;

-- 5. Enforce Uniqueness with NULLS NOT DISTINCT (Postgres 15+)
DROP INDEX IF EXISTS idx_stock_balances_unique_composite;
CREATE UNIQUE INDEX idx_stock_balances_unique_composite ON public.stock_balances (
    product_id, factory_id, state, unit_type, cap_id, inner_id
) NULLS NOT DISTINCT;

DROP INDEX IF EXISTS idx_inner_stock_balances_unique;
CREATE UNIQUE INDEX idx_inner_stock_balances_unique ON public.inner_stock_balances (
    inner_id, factory_id, state, unit_type
) NULLS NOT DISTINCT;

DROP INDEX IF EXISTS idx_cap_stock_balances_unique;
CREATE UNIQUE INDEX idx_cap_stock_balances_unique ON public.cap_stock_balances (
    cap_id, factory_id, state, unit_type
) NULLS NOT DISTINCT;

-- 6. Update RPC Functions
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
  v_unit_type TEXT := 'loose';
BEGIN
  -- 1. Fetch Metadata
  SELECT p.weight_grams, p.raw_material_id, p.color, p.inner_id, p.cap_template_id, p.template_id
  INTO v_weight_grams, v_raw_material_id, v_color, v_inner_id, v_cap_template_id, v_template_id
  FROM public.products p WHERE p.id = p_product_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  -- Machine Mapping
  SELECT COALESCE(ideal_cycle_time_seconds, 0) INTO v_ideal_cycle_time
  FROM public.machine_products WHERE machine_id = p_machine_id 
    AND (product_template_id = v_template_id OR product_id = p_product_id)
  ORDER BY (product_template_id IS NOT NULL) DESC LIMIT 1;

  v_actual_quantity := p_total_produced - COALESCE(p_damaged_count, 0);
  v_weight_wastage_kg := (v_actual_quantity * (COALESCE(p_actual_weight_grams, v_weight_grams) - v_weight_grams)) / 1000;
  IF v_weight_wastage_kg < 0 THEN v_weight_wastage_kg := 0; END IF;
  v_flagged_for_review := v_ideal_cycle_time > 0 AND p_actual_cycle_time_seconds > (v_ideal_cycle_time * 1.05);

  -- 3. Raw Material consumption
  v_required_material_kg := (v_actual_quantity * v_weight_grams) / 1000 + v_weight_wastage_kg;

  IF NOT EXISTS (SELECT 1 FROM public.raw_materials WHERE id = v_raw_material_id AND stock_weight_kg >= v_required_material_kg) THEN
    RAISE EXCEPTION 'Insufficient raw material stock';
  END IF;

  -- 5. Insert Log
  INSERT INTO public.production_logs (
    date, machine_id, product_id, user_id, factory_id, shift_number, start_time, end_time,
    total_produced, damaged_count, actual_quantity, actual_cycle_time_seconds, flagged_for_review,
    actual_weight_grams, weight_wastage_kg, total_weight_kg, downtime_minutes, downtime_reason,
    theoretical_quantity, efficiency_percentage, is_cost_recovered, shift_hours, status, created_at
  ) VALUES (
    p_date, p_machine_id, p_product_id, p_user_id, p_factory_id, p_shift_number, p_start_time, p_end_time,
    p_total_produced, p_damaged_count, v_actual_quantity, p_actual_cycle_time_seconds, v_flagged_for_review,
    p_actual_weight_grams, v_weight_wastage_kg, v_required_material_kg, p_downtime_minutes, p_downtime_reason,
    p_theoretical_quantity, p_efficiency_percentage, p_is_cost_recovered, p_shift_hours, 'submitted', NOW()
  ) RETURNING id INTO v_log_id;

  -- 6. Update Stocks (Standardizing to 'loose')
  -- Note: ON CONFLICT clause must match the unique index definition (NULLS NOT DISTINCT is implied)
  INSERT INTO public.stock_balances (product_id, state, quantity, factory_id, unit_type, cap_id, inner_id, last_updated)
  VALUES (p_product_id, 'packed', v_actual_quantity, p_factory_id, v_unit_type, NULL, v_inner_id, NOW())
  ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
  DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, last_updated = NOW();

  -- Raw Material Stock
  UPDATE public.raw_materials SET stock_weight_kg = stock_weight_kg - v_required_material_kg, updated_at = NOW() WHERE id = v_raw_material_id;

  -- 7. Log Inventory Transactions
  INSERT INTO public.inventory_transactions (product_id, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type)
  VALUES (p_product_id, 'packed', v_actual_quantity, 'production', v_log_id, p_factory_id, p_user_id, v_unit_type);

  INSERT INTO public.inventory_transactions (raw_material_id, from_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type)
  VALUES (v_raw_material_id, 'raw_material', v_required_material_kg, 'production_consumption', v_log_id, p_factory_id, p_user_id, 'kg');

  RETURN jsonb_build_object('success', true, 'log_id', v_log_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_stock(
    p_product_id uuid, p_factory_id uuid, p_state text, p_quantity_change numeric,
    p_cap_id uuid DEFAULT NULL::uuid, p_unit_type text DEFAULT 'loose'::text, p_inner_id uuid DEFAULT NULL::uuid
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.stock_balances (product_id, factory_id, state, quantity, cap_id, unit_type, inner_id, last_updated)
    VALUES (p_product_id, p_factory_id, p_state::inventory_state, p_quantity_change, p_cap_id, p_unit_type, p_inner_id, NOW())
    ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id)
    DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, last_updated = NOW();
END;
$$;

COMMIT;
