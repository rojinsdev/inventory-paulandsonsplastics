-- Migration: submit_cap_production_atomic and submit_inner_production_atomic
-- Date: 2026-04-09
-- Description: Adds atomic database functions for cap and inner production to ensure consistency.

--------------------------------------------------------------------------------
-- 1. SUBMIT CAP PRODUCTION ATOMIC
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_cap_production_atomic(
    p_date date,
    p_machine_id uuid,
    p_cap_id uuid,
    p_user_id uuid,
    p_factory_id uuid,
    p_shift_number integer,
    p_start_time time without time zone,
    p_end_time time without time zone,
    p_total_produced integer DEFAULT NULL,
    p_total_weight_produced_kg numeric DEFAULT NULL,
    p_actual_cycle_time_seconds numeric DEFAULT NULL,
    p_actual_weight_grams numeric DEFAULT NULL,
    p_downtime_minutes integer DEFAULT NULL,
    p_downtime_reason text DEFAULT NULL,
    p_remarks text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_log_id UUID;
  v_final_quantity INT;
  v_final_weight_kg NUMERIC;
  v_ideal_weight_grams NUMERIC;
  v_raw_material_id UUID;
  v_template_id UUID;
  v_ideal_cycle_time NUMERIC;
  v_cavity_count INT;
  v_weight_wastage_kg NUMERIC;
  v_actual_weight_grams_used NUMERIC;
  v_actual_cycle_time_used NUMERIC;
BEGIN
    -- 1. Fetch Cap & Mapping Metadata
    SELECT c.ideal_weight_grams, c.raw_material_id, c.template_id
    INTO v_ideal_weight_grams, v_raw_material_id, v_template_id
    FROM public.caps c WHERE c.id = p_cap_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Cap not found'; END IF;

    SELECT ideal_cycle_time_seconds, cavity_count
    INTO v_ideal_cycle_time, v_cavity_count
    FROM public.machine_cap_templates
    WHERE machine_id = p_machine_id AND cap_template_id = v_template_id;

    IF NOT FOUND THEN 
        RAISE EXCEPTION 'Machine is not configured for this cap template. Link them in Master Data first.';
    END IF;

    -- 2. Derive Final Quantity and Weight
    IF p_total_produced IS NULL AND p_total_weight_produced_kg IS NOT NULL THEN
        -- Weight-based mode
        v_final_quantity := floor((p_total_weight_produced_kg * 1000) / v_ideal_weight_grams);
        v_final_weight_kg := p_total_weight_produced_kg;
    ELSIF p_total_produced IS NOT NULL AND p_total_weight_produced_kg IS NULL THEN
        -- Unit-based mode
        v_final_quantity := p_total_produced;
        v_final_weight_kg := (p_total_produced * v_ideal_weight_grams) / 1000;
    ELSIF p_total_produced IS NOT NULL AND p_total_weight_produced_kg IS NOT NULL THEN
        v_final_quantity := p_total_produced;
        v_final_weight_kg := p_total_weight_produced_kg;
    ELSE
        RAISE EXCEPTION 'Either total_produced or total_weight_produced_kg must be provided';
    END IF;

    IF v_final_quantity < 0 THEN RAISE EXCEPTION 'Quantity cannot be negative'; END IF;

    -- 3. Prepare Logging values
    v_actual_weight_grams_used := COALESCE(p_actual_weight_grams, v_ideal_weight_grams);
    v_actual_cycle_time_used := COALESCE(p_actual_cycle_time_seconds, v_ideal_cycle_time);
    v_weight_wastage_kg := v_final_weight_kg - (v_final_quantity * v_ideal_weight_grams) / 1000;
    IF v_weight_wastage_kg < 0 THEN v_weight_wastage_kg := 0; END IF;

    -- 4. Check Raw Material Sufficiency
    IF v_raw_material_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.raw_materials WHERE id = v_raw_material_id AND stock_weight_kg >= v_final_weight_kg) THEN
            RAISE EXCEPTION 'Insufficient raw material stock';
        END IF;

        -- Deduct Raw Material
        UPDATE public.raw_materials 
        SET stock_weight_kg = stock_weight_kg - v_final_weight_kg, updated_at = NOW() 
        WHERE id = v_raw_material_id;
    END IF;

    -- 5. Insert Production Log
    INSERT INTO public.cap_production_logs (
        date, machine_id, cap_id, user_id, factory_id, shift_number, start_time, end_time,
        total_weight_produced_kg, actual_cycle_time_seconds, calculated_quantity, remarks,
        total_produced, actual_weight_grams, weight_wastage_kg, downtime_minutes, downtime_reason,
        created_at
    ) VALUES (
        p_date, p_machine_id, p_cap_id, p_user_id, p_factory_id, p_shift_number, p_start_time, p_end_time,
        v_final_weight_kg, v_actual_cycle_time_used, v_final_quantity, p_remarks,
        v_final_quantity, v_actual_weight_grams_used, v_weight_wastage_kg, p_downtime_minutes, p_downtime_reason,
        NOW()
    ) RETURNING id INTO v_log_id;

    -- 6. Update Cap Stock (Semi-finished/Loose)
    IF v_final_quantity > 0 THEN
        INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type, updated_at)
        VALUES (p_cap_id, p_factory_id, v_final_quantity, 'semi_finished', 'loose', NOW())
        ON CONFLICT (cap_id, factory_id, state, unit_type)
        DO UPDATE SET 
            quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
            updated_at = NOW();

        -- 7. Log Transactions (Audit Trail)
        -- Product Transaction
        INSERT INTO public.inventory_transactions (
            cap_id, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type, created_at
        ) VALUES (
            p_cap_id, 'semi_finished', v_final_quantity, 'production', v_log_id, p_factory_id, p_user_id, 'loose', NOW()
        );
    END IF;

    -- Raw Material Transaction
    IF v_raw_material_id IS NOT NULL THEN
        INSERT INTO public.inventory_transactions (
            raw_material_id, from_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type, created_at
        ) VALUES (
            v_raw_material_id, 'raw_material', v_final_weight_kg, 'production_consumption', v_log_id, p_factory_id, p_user_id, 'kg', NOW()
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'log_id', v_log_id, 'quantity', v_final_quantity);
END;
$function$;

--------------------------------------------------------------------------------
-- 2. SUBMIT INNER PRODUCTION ATOMIC
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_inner_production_atomic(
    p_date date,
    p_machine_id uuid,
    p_inner_id uuid,
    p_user_id uuid,
    p_factory_id uuid,
    p_shift_number integer,
    p_start_time time without time zone,
    p_end_time time without time zone,
    p_total_produced integer DEFAULT NULL,
    p_total_weight_produced_kg numeric DEFAULT NULL,
    p_actual_cycle_time_seconds numeric DEFAULT NULL,
    p_actual_weight_grams numeric DEFAULT NULL,
    p_downtime_minutes integer DEFAULT NULL,
    p_downtime_reason text DEFAULT NULL,
    p_remarks text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_log_id UUID;
  v_final_quantity INT;
  v_final_weight_kg NUMERIC;
  v_ideal_weight_grams NUMERIC;
  v_raw_material_id UUID;
  v_template_id UUID;
  v_ideal_cycle_time NUMERIC;
  v_cavity_count INT := 1; -- Default for inners usually
  v_weight_wastage_kg NUMERIC;
  v_actual_weight_grams_used NUMERIC;
  v_actual_cycle_time_used NUMERIC;
BEGIN
    -- 1. Fetch Inner & Template Metadata
    SELECT it.weight_grams, it.raw_material_id, i.template_id
    INTO v_ideal_weight_grams, v_raw_material_id, v_template_id
    FROM public.inners i 
    JOIN public.inner_templates it ON i.template_id = it.id
    WHERE i.id = p_inner_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Inner not found'; END IF;

    -- Cycle time check for inners (Uses ideal_cycle_time_seconds from inners table)
    SELECT ideal_cycle_time_seconds INTO v_ideal_cycle_time
    FROM public.inners WHERE id = p_inner_id;

    -- 2. Derive Final Quantity and Weight
    IF p_total_produced IS NULL AND p_total_weight_produced_kg IS NOT NULL THEN
        v_final_quantity := floor((p_total_weight_produced_kg * 1000) / v_ideal_weight_grams);
        v_final_weight_kg := p_total_weight_produced_kg;
    ELSIF p_total_produced IS NOT NULL AND p_total_weight_produced_kg IS NULL THEN
        v_final_quantity := p_total_produced;
        v_final_weight_kg := (p_total_produced * v_ideal_weight_grams) / 1000;
    ELSIF p_total_produced IS NOT NULL AND p_total_weight_produced_kg IS NOT NULL THEN
        v_final_quantity := p_total_produced;
        v_final_weight_kg := p_total_weight_produced_kg;
    ELSE
        RAISE EXCEPTION 'Either total_produced or total_weight_produced_kg must be provided';
    END IF;

    -- 3. Prepare Logging values
    v_actual_weight_grams_used := COALESCE(p_actual_weight_grams, v_ideal_weight_grams);
    v_actual_cycle_time_used := COALESCE(p_actual_cycle_time_seconds, v_ideal_cycle_time);
    v_weight_wastage_kg := v_final_weight_kg - (v_final_quantity * v_ideal_weight_grams) / 1000;
    IF v_weight_wastage_kg < 0 THEN v_weight_wastage_kg := 0; END IF;

    -- 4. Check Raw Material Sufficiency
    IF v_raw_material_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.raw_materials WHERE id = v_raw_material_id AND stock_weight_kg >= v_final_weight_kg) THEN
            RAISE EXCEPTION 'Insufficient raw material stock';
        END IF;

        -- Deduct Raw Material
        UPDATE public.raw_materials 
        SET stock_weight_kg = stock_weight_kg - v_final_weight_kg, updated_at = NOW() 
        WHERE id = v_raw_material_id;
    END IF;

    -- 5. Insert Production Log
    INSERT INTO public.inner_production_logs (
        date, machine_id, inner_id, user_id, factory_id, shift_number, start_time, end_time,
        total_weight_produced_kg, actual_cycle_time_seconds, calculated_quantity, remarks,
        total_produced, actual_weight_grams, weight_wastage_kg, downtime_minutes, downtime_reason,
        created_at
    ) VALUES (
        p_date, p_machine_id, p_inner_id, p_user_id, p_factory_id, p_shift_number, p_start_time, p_end_time,
        v_final_weight_kg, v_actual_cycle_time_used, v_final_quantity, p_remarks,
        v_final_quantity, v_actual_weight_grams_used, v_weight_wastage_kg, p_downtime_minutes, p_downtime_reason,
        NOW()
    ) RETURNING id INTO v_log_id;

    -- 6. Update Inner Stock (Semi-finished/Loose)
    IF v_final_quantity > 0 THEN
        INSERT INTO public.inner_stock_balances (inner_id, factory_id, quantity, state, unit_type, updated_at)
        VALUES (p_inner_id, p_factory_id, v_final_quantity, 'semi_finished', 'loose', NOW())
        ON CONFLICT (inner_id, factory_id, state, unit_type)
        DO UPDATE SET 
            quantity = inner_stock_balances.quantity + EXCLUDED.quantity,
            updated_at = NOW();

        -- 7. Log Transactions
        INSERT INTO public.inventory_transactions (
            inner_id, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type, created_at
        ) VALUES (
            p_inner_id, 'semi_finished', v_final_quantity, 'production', v_log_id, p_factory_id, p_user_id, 'loose', NOW()
        );
    END IF;

    -- Raw Material Transaction
    IF v_raw_material_id IS NOT NULL THEN
        INSERT INTO public.inventory_transactions (
            raw_material_id, from_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type, created_at
        ) VALUES (
            v_raw_material_id, 'raw_material', v_final_weight_kg, 'production_consumption', v_log_id, p_factory_id, p_user_id, 'kg', NOW()
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'log_id', v_log_id, 'quantity', v_final_quantity);
END;
$function$;
