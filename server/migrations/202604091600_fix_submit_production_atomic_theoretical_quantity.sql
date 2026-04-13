-- Fix: submit_production_atomic was missing theoretical_quantity in INSERT
-- The production_logs table has theoretical_quantity NOT NULL, but the harmonize
-- migration (202604090003) forgot to include it in the INSERT statement.
-- This adds p_theoretical_quantity as a parameter (DEFAULT 0) and stores it.

CREATE OR REPLACE FUNCTION public.submit_production_atomic(
    p_machine_id uuid,
    p_product_id uuid,
    p_shift_number integer,
    p_start_time time,
    p_end_time time,
    p_total_produced integer,
    p_damaged_count integer,
    p_actual_cycle_time_seconds numeric,
    p_actual_weight_grams numeric,
    p_wastage_kg numeric,
    p_downtime_reason text,
    p_date date,
    p_user_id uuid,
    p_factory_id uuid,
    p_downtime_minutes integer DEFAULT 0,
    p_efficiency_percentage numeric DEFAULT 0,
    p_flagged_for_review boolean DEFAULT false,
    p_weight_wastage_kg numeric DEFAULT 0,
    p_theoretical_quantity integer DEFAULT 0
) RETURNS uuid AS $$
DECLARE
    v_log_id uuid;
    v_ideal_weight numeric;
    v_total_weight_kg numeric;
    v_raw_material_id uuid;
    v_quantity_semi_finished integer;
BEGIN
    -- 1. Get Product Details
    SELECT weight_grams, raw_material_id 
    INTO v_ideal_weight, v_raw_material_id 
    FROM public.products WHERE id = p_product_id;
    
    v_quantity_semi_finished := p_total_produced - COALESCE(p_damaged_count, 0);
    v_total_weight_kg := (p_total_produced * p_actual_weight_grams) / 1000.0;

    -- 2. Insert Production Log
    INSERT INTO public.production_logs (
        machine_id, product_id, shift_number, start_time, end_time,
        total_produced, damaged_count, actual_cycle_time_seconds,
        actual_weight_grams, weight_wastage_kg, downtime_reason,
        date, user_id, factory_id, downtime_minutes, efficiency_percentage,
        flagged_for_review, actual_quantity, total_weight_kg, theoretical_quantity, created_at
    ) VALUES (
        p_machine_id, p_product_id, p_shift_number, p_start_time, p_end_time,
        p_total_produced, p_damaged_count, p_actual_cycle_time_seconds,
        p_actual_weight_grams, COALESCE(p_weight_wastage_kg, p_wastage_kg, 0), p_downtime_reason,
        p_date, p_user_id, p_factory_id, p_downtime_minutes, p_efficiency_percentage,
        p_flagged_for_review, v_quantity_semi_finished, v_total_weight_kg, p_theoretical_quantity, NOW()
    ) RETURNING id INTO v_log_id;

    -- 3. Update Stock Balance (Semi-finished)
    IF v_quantity_semi_finished > 0 THEN
        INSERT INTO public.stock_balances (product_id, factory_id, quantity, state, unit_type, cap_id, inner_id, updated_at)
        VALUES (p_product_id, p_factory_id, v_quantity_semi_finished, 'semi_finished', 'loose', NULL, NULL, NOW())
        ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id)
        DO UPDATE SET
            quantity = stock_balances.quantity + EXCLUDED.quantity,
            updated_at = NOW();

        -- 4. Record Transaction
        INSERT INTO public.inventory_transactions (
            product_id, to_state, quantity, reference_id, created_by, transaction_type, factory_id, unit_type, created_at
        ) VALUES (
            p_product_id, 'semi_finished', v_quantity_semi_finished, v_log_id, p_user_id, 'production', p_factory_id, 'loose', NOW()
        );
    END IF;

    -- 5. Deduct Raw Material
    IF v_raw_material_id IS NOT NULL THEN
        UPDATE public.raw_materials
        SET stock_weight_kg = stock_weight_kg - (v_total_weight_kg + COALESCE(p_weight_wastage_kg, p_wastage_kg, 0)),
            updated_at = NOW()
        WHERE id = v_raw_material_id;

        -- Record Consumption Transaction
        INSERT INTO public.inventory_transactions (
            raw_material_id, from_state, quantity, reference_id, created_by, transaction_type, factory_id, unit_type, created_at
        ) VALUES (
            v_raw_material_id, 'raw_material', (v_total_weight_kg + COALESCE(p_weight_wastage_kg, p_wastage_kg, 0)), v_log_id, p_user_id, 'production_consumption', p_factory_id, 'kg', NOW()
        );
    END IF;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;
