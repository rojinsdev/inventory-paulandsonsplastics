-- DYNAMIC FUNC SYNC (Final Harmonized Version - 2026-04-09)

-- 1. DROP EXISTING OVERLOADS TO PREVENT AMBIGUITY
DROP FUNCTION IF EXISTS public.adjust_cap_stock(uuid, uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.prepare_order_items_atomic(uuid, jsonb, uuid);
DROP FUNCTION IF EXISTS public.process_partial_dispatch(uuid, jsonb, text, numeric, text, date, numeric, text, uuid, text);
DROP FUNCTION IF EXISTS public.process_partial_dispatch(uuid, jsonb, text, numeric, text, timestamp with time zone, numeric, text, uuid, text);
DROP FUNCTION IF EXISTS public.submit_cap_production_atomic(uuid, uuid, integer, text, text, integer, integer, numeric, numeric, numeric, text, text, date, uuid, uuid);
DROP FUNCTION IF EXISTS public.submit_inner_production_atomic(uuid, uuid, integer, text, text, integer, integer, numeric, numeric, numeric, text, text, date, uuid, uuid);
DROP FUNCTION IF EXISTS public.submit_production_atomic(uuid, uuid, integer, time without time zone, time without time zone, integer, integer, numeric, numeric, integer, text, date, uuid, uuid, integer, numeric, boolean, numeric);

-- 2. CORE RPC DEFINITIONS

-- [RPC] adjust_cap_stock
CREATE OR REPLACE FUNCTION public.adjust_cap_stock(
    p_cap_id uuid,
    p_factory_id uuid,
    p_quantity numeric,
    p_state text,
    p_unit_type text DEFAULT 'loose'
) RETURNS void AS $$
BEGIN
    INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type, updated_at)
    VALUES (p_cap_id, p_factory_id, p_quantity, p_state, p_unit_type, NOW())
    ON CONFLICT (cap_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- [RPC] prepare_order_items_atomic
CREATE OR REPLACE FUNCTION public.prepare_order_items_atomic(
    p_order_id uuid,
    p_items jsonb,
    p_user_id uuid
) RETURNS void AS $$
DECLARE
    v_item RECORD;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) 
        AS x(id uuid, product_id uuid, quantity integer, unit_type text, cap_id uuid, include_inner boolean, inner_id uuid)
    LOOP
        -- Update prepared quantity
        UPDATE public.sales_order_items 
        SET quantity_prepared = quantity_prepared + v_item.quantity,
            is_prepared = (quantity_prepared + v_item.quantity >= quantity),
            prepared_at = NOW(),
            prepared_by = p_user_id
        WHERE id = v_item.id;

        -- Deduct from semi_finished, Add to reserved
        IF v_item.cap_id IS NOT NULL THEN
            UPDATE public.cap_stock_balances 
            SET quantity = quantity - v_item.quantity, updated_at = NOW()
            WHERE cap_id = v_item.cap_id AND state = 'semi_finished' AND unit_type = 'loose';

            INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type, updated_at)
            SELECT cap_id, factory_id, v_item.quantity, 'reserved', 'loose', NOW()
            FROM public.cap_stock_balances WHERE cap_id = v_item.cap_id LIMIT 1
            ON CONFLICT (cap_id, factory_id, state, unit_type)
            DO UPDATE SET quantity = cap_stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();
        END IF;

        IF v_item.inner_id IS NOT NULL AND v_item.include_inner THEN
            UPDATE public.inner_stock_balances 
            SET quantity = quantity - v_item.quantity, updated_at = NOW()
            WHERE inner_id = v_item.inner_id AND state = 'semi_finished' AND unit_type = 'loose';

            INSERT INTO public.inner_stock_balances (inner_id, factory_id, quantity, state, unit_type, updated_at)
            SELECT inner_id, factory_id, v_item.quantity, 'reserved', 'loose', NOW()
            FROM public.inner_stock_balances WHERE inner_id = v_item.inner_id LIMIT 1
            ON CONFLICT (inner_id, factory_id, state, unit_type)
            DO UPDATE SET quantity = inner_stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();
        END IF;

        IF v_item.product_id IS NOT NULL THEN
            UPDATE public.stock_balances 
            SET quantity = quantity - v_item.quantity, updated_at = NOW()
            WHERE product_id = v_item.product_id AND state = 'semi_finished' AND unit_type = v_item.unit_type;

            INSERT INTO public.stock_balances (product_id, factory_id, quantity, state, unit_type, updated_at)
            SELECT product_id, factory_id, v_item.quantity, 'reserved', v_item.unit_type, NOW()
            FROM public.stock_balances WHERE product_id = v_item.product_id LIMIT 1
            ON CONFLICT (product_id, factory_id, state, unit_type)
            DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- [RPC] submit_cap_production_atomic
CREATE OR REPLACE FUNCTION public.submit_cap_production_atomic(
    p_machine_id uuid,
    p_cap_id uuid,
    p_shift_number integer,
    p_start_time text,
    p_end_time text,
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
    SELECT ideal_weight_grams, raw_material_id INTO v_ideal_weight, v_raw_material_id FROM public.caps WHERE id = p_cap_id;
    v_total_weight_kg := (p_total_produced * p_actual_weight_grams) / 1000.0;

    INSERT INTO public.cap_production_logs (
        machine_id, cap_id, shift_number, start_time, end_time,
        total_produced, calculated_quantity, downtime_minutes, actual_cycle_time_seconds,
        actual_weight_grams, weight_wastage_kg, downtime_reason,
        remarks, date, user_id, factory_id, total_weight_produced_kg
    ) VALUES (
        p_machine_id, p_cap_id, p_shift_number, p_start_time, p_end_time,
        p_total_produced, p_total_produced, p_downtime_minutes, p_actual_cycle_time_seconds,
        p_actual_weight_grams, p_weight_wastage_kg, p_downtime_reason,
        p_remarks, p_date, p_user_id, p_factory_id, v_total_weight_kg
    ) RETURNING id INTO v_log_id;

    INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type, updated_at)
    VALUES (p_cap_id, p_factory_id, p_total_produced, 'semi_finished', 'loose', NOW())
    ON CONFLICT (cap_id, factory_id, state, unit_type) 
    DO UPDATE SET quantity = cap_stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();

    INSERT INTO public.inventory_transactions (
        cap_id, to_state, quantity, reference_id, note, created_by, transaction_type, factory_id, unit_type, created_at
    ) VALUES (
        p_cap_id, 'semi_finished', p_total_produced, v_log_id, 'Production entry', p_user_id, 'production', p_factory_id, 'loose', NOW()
    );

    IF v_raw_material_id IS NOT NULL THEN
        UPDATE public.raw_materials SET stock_weight_kg = stock_weight_kg - (v_total_weight_kg + p_weight_wastage_kg), updated_at = NOW() WHERE id = v_raw_material_id;
        INSERT INTO public.inventory_transactions (
            raw_material_id, from_state, quantity, reference_id, note, created_by, transaction_type, factory_id, unit_type, created_at
        ) VALUES (
            v_raw_material_id, 'raw_material', (v_total_weight_kg + p_weight_wastage_kg), v_log_id, 'Production consumption', p_user_id, 'production_consumption', p_factory_id, 'kg', NOW()
        );
    END IF;
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- [RPC] submit_inner_production_atomic
CREATE OR REPLACE FUNCTION public.submit_inner_production_atomic(
    p_machine_id uuid,
    p_inner_id uuid,
    p_shift_number integer,
    p_start_time text,
    p_end_time text,
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
    SELECT i.ideal_weight_grams, t.raw_material_id INTO v_ideal_weight, v_raw_material_id FROM public.inners i
    JOIN public.inner_templates t ON i.template_id = t.id WHERE i.id = p_inner_id;
    v_total_weight_kg := (p_total_produced * p_actual_weight_grams) / 1000.0;

    INSERT INTO public.inner_production_logs (
        machine_id, inner_id, shift_number, start_time, end_time,
        calculated_quantity, downtime_minutes, actual_cycle_time_seconds,
        actual_weight_grams, weight_wastage_kg, downtime_reason,
        date, user_id, factory_id, total_weight_produced_kg
    ) VALUES (
        p_machine_id, p_inner_id, p_shift_number, p_start_time, p_end_time,
        p_total_produced, p_downtime_minutes, p_actual_cycle_time_seconds,
        p_actual_weight_grams, p_weight_wastage_kg, p_downtime_reason,
        p_date, p_user_id, p_factory_id, v_total_weight_kg
    ) RETURNING id INTO v_log_id;

    INSERT INTO public.inner_stock_balances (inner_id, factory_id, quantity, state, unit_type, updated_at)
    VALUES (p_inner_id, p_factory_id, p_total_produced, 'semi_finished', 'loose', NOW())
    ON CONFLICT (inner_id, factory_id, state, unit_type) 
    DO UPDATE SET quantity = inner_stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();

    INSERT INTO public.inventory_transactions (
        inner_id, to_state, quantity, reference_id, note, created_by, transaction_type, factory_id, unit_type, created_at
    ) VALUES (
        p_inner_id, 'semi_finished', p_total_produced, v_log_id, 'Production entry', p_user_id, 'production', p_factory_id, 'loose', NOW()
    );

    IF v_raw_material_id IS NOT NULL THEN
        UPDATE public.raw_materials SET stock_weight_kg = stock_weight_kg - (v_total_weight_kg + p_weight_wastage_kg), updated_at = NOW() WHERE id = v_raw_material_id;
        INSERT INTO public.inventory_transactions (
            raw_material_id, from_state, quantity, reference_id, note, created_by, transaction_type, factory_id, unit_type, created_at
        ) VALUES (
            v_raw_material_id, 'raw_material', (v_total_weight_kg + p_weight_wastage_kg), v_log_id, 'Production consumption', p_user_id, 'production_consumption', p_factory_id, 'kg', NOW()
        );
    END IF;
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- [RPC] submit_production_atomic
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
    p_weight_wastage_kg numeric DEFAULT 0
) RETURNS uuid AS $$
DECLARE
    v_log_id uuid;
    v_ideal_weight numeric;
    v_total_weight_kg numeric;
    v_raw_material_id uuid;
    v_quantity_semi_finished integer;
BEGIN
    SELECT weight_grams, raw_material_id INTO v_ideal_weight, v_raw_material_id FROM public.products WHERE id = p_product_id;
    v_quantity_semi_finished := p_total_produced - COALESCE(p_damaged_count, 0);
    v_total_weight_kg := (p_total_produced * p_actual_weight_grams) / 1000.0;

    INSERT INTO public.production_logs (
        machine_id, product_id, shift_number, start_time, end_time,
        total_produced, damaged_count, actual_cycle_time_seconds,
        actual_weight_grams, weight_wastage_kg, downtime_reason,
        date, user_id, factory_id, downtime_minutes, efficiency_percentage,
        flagged_for_review, actual_quantity, total_weight_kg, created_at
    ) VALUES (
        p_machine_id, p_product_id, p_shift_number, p_start_time, p_end_time,
        p_total_produced, p_damaged_count, p_actual_cycle_time_seconds,
        p_actual_weight_grams, COALESCE(p_weight_wastage_kg, p_wastage_kg, 0), p_downtime_reason,
        p_date, p_user_id, p_factory_id, p_downtime_minutes, p_efficiency_percentage,
        p_flagged_for_review, v_quantity_semi_finished, v_total_weight_kg, NOW()
    ) RETURNING id INTO v_log_id;

    IF v_quantity_semi_finished > 0 THEN
        INSERT INTO public.stock_balances (product_id, factory_id, quantity, state, unit_type, updated_at)
        VALUES (p_product_id, p_factory_id, v_quantity_semi_finished, 'semi_finished', 'loose', NOW())
        ON CONFLICT (product_id, factory_id, state, unit_type) 
        DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();

        INSERT INTO public.inventory_transactions (
            product_id, to_state, quantity, reference_id, created_by, transaction_type, factory_id, unit_type, created_at
        ) VALUES (p_product_id, 'semi_finished', v_quantity_semi_finished, v_log_id, p_user_id, 'production', p_factory_id, 'loose', NOW());
    END IF;

    IF v_raw_material_id IS NOT NULL THEN
        UPDATE public.raw_materials SET stock_weight_kg = stock_weight_kg - (v_total_weight_kg + COALESCE(p_weight_wastage_kg, p_wastage_kg, 0)), updated_at = NOW() WHERE id = v_raw_material_id;
        INSERT INTO public.inventory_transactions (
            raw_material_id, from_state, quantity, reference_id, created_by, transaction_type, factory_id, unit_type, created_at
        ) VALUES (v_raw_material_id, 'raw_material', (v_total_weight_kg + COALESCE(p_weight_wastage_kg, p_wastage_kg, 0)), v_log_id, p_user_id, 'production_consumption', p_factory_id, 'kg', NOW());
    END IF;
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- [RPC] process_partial_dispatch
CREATE OR REPLACE FUNCTION public.process_partial_dispatch(
    p_order_id uuid,
    p_dispatch_items jsonb,
    p_payment_mode text,
    p_amount_paid numeric,
    p_notes text,
    p_dispatch_date timestamp with time zone,
    p_total_amount numeric,
    p_discount_type text,
    p_recorded_by uuid,
    p_customer_id text
) RETURNS uuid AS $$
DECLARE
    v_dispatch_id uuid;
    v_item RECORD;
    v_subtotal numeric := 0;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_dispatch_items) AS x(sales_order_item_id uuid, quantity_shipped integer, unit_price numeric) LOOP
        v_subtotal := v_subtotal + (v_item.quantity_shipped * v_item.unit_price);
    END LOOP;

    INSERT INTO public.dispatch_records (
        order_id, dispatch_date, subtotal, total_amount, recorded_by, notes, created_at
    ) VALUES (p_order_id, p_dispatch_date, v_subtotal, p_total_amount, p_recorded_by, p_notes, NOW()) RETURNING id INTO v_dispatch_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_dispatch_items) AS x(sales_order_item_id uuid, quantity_shipped integer, product_id uuid, unit_type text, cap_id uuid, inner_id uuid, include_inner boolean) LOOP
        INSERT INTO public.dispatch_items (dispatch_id, sales_order_item_id, quantity_shipped, created_at)
        VALUES (v_dispatch_id, v_item.sales_order_item_id, v_item.quantity_shipped, NOW());

        UPDATE public.sales_order_items SET quantity_shipped = quantity_shipped + v_item.quantity_shipped WHERE id = v_item.sales_order_item_id;

        IF v_item.product_id IS NOT NULL THEN
            UPDATE public.stock_balances SET quantity = quantity - v_item.quantity_shipped, updated_at = NOW() WHERE product_id = v_item.product_id AND state = 'reserved' AND unit_type = v_item.unit_type;
            INSERT INTO public.stock_balances (product_id, factory_id, quantity, state, unit_type, updated_at)
            SELECT product_id, factory_id, v_item.quantity_shipped, 'delivered', v_item.unit_type, NOW()
            FROM public.stock_balances WHERE product_id = v_item.product_id LIMIT 1
            ON CONFLICT (product_id, factory_id, state, unit_type) DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();

            INSERT INTO public.inventory_transactions (product_id, from_state, to_state, quantity, reference_id, note, created_by, transaction_type, factory_id, unit_type, created_at)
            VALUES (v_item.product_id, 'reserved', 'delivered', v_item.quantity_shipped, v_dispatch_id, 'Partial dispatch', p_recorded_by, 'dispatch', (SELECT factory_id FROM public.stock_balances WHERE product_id = v_item.product_id LIMIT 1), v_item.unit_type, NOW());
        END IF;

        IF v_item.cap_id IS NOT NULL THEN
            UPDATE public.cap_stock_balances SET quantity = quantity - v_item.quantity_shipped, updated_at = NOW() WHERE cap_id = v_item.cap_id AND state = 'reserved' AND unit_type = 'loose';
            INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type, updated_at)
            SELECT cap_id, factory_id, v_item.quantity_shipped, 'delivered', 'loose', NOW()
            FROM public.cap_stock_balances WHERE cap_id = v_item.cap_id LIMIT 1
            ON CONFLICT (cap_id, factory_id, state, unit_type) DO UPDATE SET quantity = cap_stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();
        END IF;

        IF v_item.inner_id IS NOT NULL AND v_item.include_inner THEN
            UPDATE public.inner_stock_balances SET quantity = quantity - v_item.quantity_shipped, updated_at = NOW() WHERE inner_id = v_item.inner_id AND state = 'reserved' AND unit_type = 'loose';
            INSERT INTO public.inner_stock_balances (inner_id, factory_id, quantity, state, unit_type, updated_at)
            SELECT inner_id, factory_id, v_item.quantity_shipped, 'delivered', 'loose', NOW()
            FROM public.inner_stock_balances WHERE inner_id = v_item.inner_id LIMIT 1
            ON CONFLICT (inner_id, factory_id, state, unit_type) DO UPDATE SET quantity = inner_stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();
        END IF;
    END LOOP;

    UPDATE public.sales_orders SET status = CASE WHEN (SELECT bool_and(quantity_shipped >= quantity) FROM public.sales_order_items WHERE order_id = p_order_id) THEN 'delivered' ELSE 'partially_delivered' END, amount_paid = amount_paid + p_amount_paid, updated_at = NOW() WHERE id = p_order_id;
    IF p_amount_paid > 0 THEN
        INSERT INTO public.payments (sales_order_id, customer_id, amount, payment_date, recorded_by, created_at)
        VALUES (p_order_id, p_customer_id::uuid, p_amount_paid, p_dispatch_date, p_recorded_by, NOW());
    END IF;
    RETURN v_dispatch_id;
END;
$$ LANGUAGE plpgsql;

-- [RPC] create_order_atomic
CREATE OR REPLACE FUNCTION public.create_order_atomic(p_customer_id uuid, p_delivery_date text, p_notes text, p_user_id uuid, p_items jsonb, p_order_date text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $$
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
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, cap_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN) LOOP
        IF v_item.product_id IS NOT NULL THEN
            SELECT selling_price INTO v_resource_data FROM public.products WHERE id = v_item.product_id;
            v_total_amount := v_total_amount + (v_item.quantity * COALESCE(v_item.unit_price, v_resource_data.selling_price, 0));
        ELSIF v_item.cap_id IS NOT NULL THEN
            v_total_amount := v_total_amount + (v_item.quantity * COALESCE(v_item.unit_price, 0));
        END IF;
    END LOOP;

    -- 2. Validate Credit Limit
    SELECT balance_due, credit_limit INTO v_customer_balance, v_customer_limit FROM public.customers WHERE id = p_customer_id;
    IF (COALESCE(v_customer_balance, 0) + v_total_amount) > COALESCE(v_customer_limit, 999999999) THEN
        RAISE EXCEPTION 'Order blocked: Total balance with this order (%) would exceed credit limit (%)', (COALESCE(v_customer_balance, 0) + v_total_amount), v_customer_limit;
    END IF;

    -- 3. Create Sales Order
    INSERT INTO public.sales_orders (customer_id, delivery_date, status, notes, created_by, order_date, total_amount, balance_due, amount_paid)
    VALUES (p_customer_id, CASE WHEN p_delivery_date IS NULL OR p_delivery_date = '' THEN NULL ELSE p_delivery_date::DATE END, 'pending', p_notes, p_user_id, p_order_date::DATE, v_total_amount, v_total_amount, 0) RETURNING id INTO v_order_id;

    -- 4. Process Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, cap_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN) LOOP
        IF v_item.product_id IS NOT NULL THEN
            SELECT p.selling_price, p.factory_id, p.inner_id, pt.inner_template_id INTO v_resource_data FROM public.products p LEFT JOIN public.product_templates pt ON p.template_id = pt.id WHERE p.id = v_item.product_id;
            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);
            v_target_inner_id := CASE WHEN v_item.include_inner = TRUE THEN v_resource_data.inner_id ELSE NULL END;

            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock FROM public.stock_balances WHERE product_id = v_item.product_id AND unit_type = COALESCE(v_item.unit_type, 'bundle') AND state IN ('semi_finished', 'packed', 'finished') AND (factory_id = v_factory_id OR factory_id IS NULL) AND ((COALESCE(v_item.include_inner, FALSE) = TRUE AND inner_id = v_target_inner_id) OR (COALESCE(v_item.include_inner, FALSE) = FALSE AND inner_id IS NULL));
            v_is_backordered := v_available_stock < v_item.quantity;

            INSERT INTO public.sales_order_items (order_id, product_id, quantity, quantity_prepared, quantity_reserved, unit_type, unit_price, is_backordered, is_prepared, include_inner, inner_id)
            VALUES (v_order_id, v_item.product_id, v_item.quantity, 0, 0, COALESCE(v_item.unit_type, 'bundle'), COALESCE(v_item.unit_price, v_resource_data.selling_price, 0), v_is_backordered, FALSE, COALESCE(v_item.include_inner, FALSE), v_target_inner_id);
        ELSIF v_item.cap_id IS NOT NULL THEN
            SELECT factory_id INTO v_resource_data FROM public.caps WHERE id = v_item.cap_id;
            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);
            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock FROM public.cap_stock_balances WHERE cap_id = v_item.cap_id AND unit_type = COALESCE(v_item.unit_type, 'loose') AND state IN ('finished') AND (factory_id = v_factory_id OR factory_id IS NULL);
            v_is_backordered := v_available_stock < v_item.quantity;

            INSERT INTO public.sales_order_items (order_id, cap_id, quantity, quantity_prepared, quantity_reserved, unit_type, unit_price, is_backordered, is_prepared)
            VALUES (v_order_id, v_item.cap_id, v_item.quantity, 0, 0, COALESCE(v_item.unit_type, 'loose'), COALESCE(v_item.unit_price, 0), v_is_backordered, FALSE);
        END IF;
    END LOOP;
    RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'total_amount', v_total_amount);
END;
$$ LANGUAGE plpgsql;
