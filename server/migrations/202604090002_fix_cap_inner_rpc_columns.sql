-- Fix column name mismatch in cap and inner production RPCs
-- Caps and Inners use 'ideal_weight_grams' instead of 'weight_grams'

-- Fix submit_cap_production_atomic
CREATE OR REPLACE FUNCTION public.submit_cap_production_atomic(
    p_machine_id uuid,
    p_cap_id uuid,
    p_shift_number integer,
    p_start_time time,
    p_end_time time,
    p_total_produced integer,
    p_downtime_minutes integer,
    p_actual_cycle_time_seconds numeric,
    p_actual_weight_grams numeric,
    p_weight_wastage_kg numeric,
    p_downtime_reason text,
    p_remarks text,
    p_date date,
    p_user_id uuid,
    p_factory_id uuid
) RETURNS uuid AS $$
DECLARE
    v_log_id uuid;
    v_ideal_weight numeric;
    v_total_weight_kg numeric;
    v_raw_material_id uuid;
BEGIN
    -- 1. Get Cap Details
    SELECT ideal_weight_grams, raw_material_id 
    INTO v_ideal_weight, v_raw_material_id 
    FROM public.caps WHERE id = p_cap_id;
    
    -- 2. Calculate Total Produced (by weight)
    v_total_weight_kg := (p_total_produced * p_actual_weight_grams) / 1000.0;

    -- 3. Insert Production Log
    INSERT INTO public.cap_production_logs (
        machine_id, cap_id, shift_number, start_time, end_time,
        total_produced, downtime_minutes, actual_cycle_time_seconds,
        actual_weight_grams, weight_wastage_kg, downtime_reason,
        remarks, date, user_id, factory_id, total_weight_produced_kg
    ) VALUES (
        p_machine_id, p_cap_id, p_shift_number, p_start_time::text, p_end_time::text,
        p_total_produced, p_downtime_minutes, p_actual_cycle_time_seconds,
        p_actual_weight_grams, p_weight_wastage_kg, p_downtime_reason,
        p_remarks, p_date, p_user_id, p_factory_id, v_total_weight_kg
    ) RETURNING id INTO v_log_id;

    -- 4. Update Stock Balance
    INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type, updated_at)
    VALUES (p_cap_id, p_factory_id, p_total_produced, 'finished', 'loose', now())
    ON CONFLICT (cap_id, factory_id, state, unit_type) 
    DO UPDATE SET 
        quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
        updated_at = now();

    -- 5. Record Transaction
    INSERT INTO public.inventory_transactions (
        cap_id, to_state, quantity, reference_id, note, created_by, transaction_type, factory_id, unit_type
    ) VALUES (
        p_cap_id, 'finished', p_total_produced, v_log_id, 'Production entry', p_user_id, 'production', p_factory_id, 'loose'
    );

    -- 6. Deduct Raw Material (Total Weight + Wastage)
    IF v_raw_material_id IS NOT NULL THEN
        UPDATE public.raw_materials
        SET stock_weight_kg = stock_weight_kg - (v_total_weight_kg + p_weight_wastage_kg),
            updated_at = now()
        WHERE id = v_raw_material_id;
    END IF;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Fix submit_inner_production_atomic
CREATE OR REPLACE FUNCTION public.submit_inner_production_atomic(
    p_machine_id uuid,
    p_inner_id uuid,
    p_shift_number integer,
    p_start_time time,
    p_end_time time,
    p_total_produced integer,
    p_downtime_minutes integer,
    p_actual_cycle_time_seconds numeric,
    p_actual_weight_grams numeric,
    p_weight_wastage_kg numeric,
    p_downtime_reason text,
    p_remarks text,
    p_date date,
    p_user_id uuid,
    p_factory_id uuid
) RETURNS uuid AS $$
DECLARE
    v_log_id uuid;
    v_ideal_weight numeric;
    v_total_weight_kg numeric;
    v_raw_material_id uuid;
BEGIN
    -- 1. Get Inner Details (From template via inner)
    SELECT i.ideal_weight_grams, t.raw_material_id 
    INTO v_ideal_weight, v_raw_material_id 
    FROM public.inners i
    JOIN public.inner_templates t ON i.template_id = t.id
    WHERE i.id = p_inner_id;
    
    -- 2. Calculate Total Produced (by weight)
    v_total_weight_kg := (p_total_produced * p_actual_weight_grams) / 1000.0;

    -- 3. Insert Production Log
    INSERT INTO public.inner_production_logs (
        machine_id, inner_id, shift_number, start_time, end_time,
        calculated_quantity, downtime_minutes, actual_cycle_time_seconds,
        actual_weight_grams, weight_wastage_kg, downtime_reason,
        date, user_id, factory_id, total_weight_produced_kg
    ) VALUES (
        p_machine_id, p_inner_id, p_shift_number, p_start_time::text, p_end_time::text,
        p_total_produced, p_downtime_minutes, p_actual_cycle_time_seconds,
        p_actual_weight_grams, p_weight_wastage_kg, p_downtime_reason,
        p_date, p_user_id, p_factory_id, v_total_weight_kg
    ) RETURNING id INTO v_log_id;

    -- 4. Update Stock Balance
    INSERT INTO public.inner_stock_balances (inner_id, factory_id, quantity, state, unit_type, updated_at)
    VALUES (p_inner_id, p_factory_id, p_total_produced, 'finished', 'loose', now())
    ON CONFLICT (inner_id, factory_id, state, unit_type) 
    DO UPDATE SET 
        quantity = inner_stock_balances.quantity + EXCLUDED.quantity,
        updated_at = now();

    -- 5. Record Transaction
    INSERT INTO public.inventory_transactions (
        inner_id, to_state, quantity, reference_id, note, created_by, transaction_type, factory_id, unit_type
    ) VALUES (
        inner_id, 'finished', p_total_produced, v_log_id, 'Production entry', p_user_id, 'production', p_factory_id, 'loose'
    );

    -- 6. Deduct Raw Material (Total Weight + Wastage)
    IF v_raw_material_id IS NOT NULL THEN
        UPDATE public.raw_materials
        SET stock_weight_kg = stock_weight_kg - (v_total_weight_kg + p_weight_wastage_kg),
            updated_at = now()
        WHERE id = v_raw_material_id;
    END IF;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;
