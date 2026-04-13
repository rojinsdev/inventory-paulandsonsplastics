-- Fix: process_partial_dispatch had a completely wrong/old signature in the DB.
-- The DB had the original 2024-era version with params like p_dispatch_items,
-- p_amount_paid, p_dispatch_date, p_recorded_by, p_customer_id which no longer
-- match what the service sends (p_items, p_discount_value, p_credit_deadline,
-- p_initial_payment, p_user_id, p_payment_method).
-- PostgREST schema cache couldn't match any overload → 500 "not found in schema cache".

DROP FUNCTION IF EXISTS public.process_partial_dispatch(uuid, jsonb, text, numeric, text, timestamp with time zone, numeric, text, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.process_partial_dispatch(uuid, jsonb, text, numeric, text, date, numeric, text, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.process_partial_dispatch(uuid, jsonb, text, numeric, text, date, numeric, text, uuid, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.process_partial_dispatch(
    p_order_id uuid,
    p_items jsonb,
    p_discount_type text,
    p_discount_value numeric,
    p_payment_mode text,
    p_credit_deadline date,
    p_initial_payment numeric,
    p_notes text,
    p_user_id uuid,
    p_payment_method text DEFAULT 'cash'::text
) RETURNS jsonb
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

    -- Calculate subtotal from items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INTEGER, unit_price NUMERIC) LOOP
        v_subtotal := v_subtotal + (v_item.quantity * v_item.unit_price);
    END LOOP;

    IF p_discount_type = 'percentage' THEN
        v_batch_discount := (v_subtotal * COALESCE(p_discount_value, 0)) / 100;
    ELSE
        v_batch_discount := COALESCE(p_discount_value, 0);
    END IF;
    v_batch_total := v_subtotal - v_batch_discount;

    -- Create dispatch record
    INSERT INTO public.dispatch_records (
        order_id, subtotal, discount_value, total_amount, recorded_by, notes
    ) VALUES (
        p_order_id, v_subtotal, v_batch_discount, v_batch_total, p_user_id, p_notes
    ) RETURNING id INTO v_dispatch_id;

    -- Process each dispatched item
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INTEGER, unit_price NUMERIC) LOOP
        DECLARE v_remaining_to_dispatch INT := v_item.quantity;
        BEGIN
            SELECT soi.product_id, soi.cap_id, soi.unit_type, soi.quantity_shipped,
                   soi.quantity_reserved, COALESCE(p.factory_id, c.factory_id) as factory_id,
                   soi.quantity as target_qty
            INTO v_current_item
            FROM public.sales_order_items soi
            LEFT JOIN public.products p ON p.id = soi.product_id
            LEFT JOIN public.caps c ON c.id = soi.cap_id
            WHERE soi.id = v_item.item_id;

            IF v_item.quantity > (v_current_item.quantity_reserved - v_current_item.quantity_shipped) THEN
                RAISE EXCEPTION 'Cannot dispatch % for item %. Only % reserved.',
                    v_item.quantity, v_item.item_id,
                    (v_current_item.quantity_reserved - v_current_item.quantity_shipped);
            END IF;

            UPDATE public.sales_order_items
            SET quantity_shipped = quantity_shipped + v_item.quantity,
                unit_price = v_item.unit_price,
                is_prepared = (quantity_shipped + v_item.quantity) >= v_current_item.target_qty
            WHERE id = v_item.item_id;

            INSERT INTO public.dispatch_items (dispatch_id, sales_order_item_id, quantity_shipped)
            VALUES (v_dispatch_id, v_item.item_id, v_item.quantity);

            -- Deduct from reserved stock
            IF v_current_item.cap_id IS NOT NULL THEN
                FOR v_balance IN
                    SELECT id, quantity FROM public.cap_stock_balances
                    WHERE cap_id = v_current_item.cap_id AND state = 'reserved'
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, 'loose')
                      AND quantity > 0 ORDER BY quantity DESC
                LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    UPDATE public.cap_stock_balances
                    SET quantity = quantity - LEAST(v_remaining_to_dispatch, v_balance.quantity), updated_at = NOW()
                    WHERE id = v_balance.id;
                    v_remaining_to_dispatch := v_remaining_to_dispatch - LEAST(v_remaining_to_dispatch, v_balance.quantity);
                END LOOP;
            ELSE
                FOR v_balance IN
                    SELECT id, quantity FROM public.stock_balances
                    WHERE product_id = v_current_item.product_id AND state = 'reserved'
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, '') AND quantity > 0 ORDER BY quantity DESC
                LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    UPDATE public.stock_balances
                    SET quantity = quantity - LEAST(v_remaining_to_dispatch, v_balance.quantity), updated_at = NOW()
                    WHERE id = v_balance.id;
                    v_remaining_to_dispatch := v_remaining_to_dispatch - LEAST(v_remaining_to_dispatch, v_balance.quantity);
                END LOOP;
            END IF;
        END;
    END LOOP;

    -- Record initial payment if provided
    IF COALESCE(p_initial_payment, 0) > 0 THEN
        INSERT INTO public.payments (sales_order_id, customer_id, amount, payment_method, notes, recorded_by)
        VALUES (p_order_id, v_customer_id, p_initial_payment, COALESCE(p_payment_method, 'cash'),
                'Initial payment for dispatch ' || v_dispatch_id, p_user_id)
        RETURNING id INTO v_payment_id;
    END IF;

    -- Update order status and financials
    UPDATE public.sales_orders
    SET amount_paid = amount_paid + COALESCE(p_initial_payment, 0),
        payment_mode = COALESCE(p_payment_mode, payment_mode),
        credit_deadline = COALESCE(p_credit_deadline, credit_deadline),
        status = CASE
            WHEN (SELECT EVERY(quantity_shipped >= quantity) FROM public.sales_order_items WHERE order_id = p_order_id)
            THEN 'delivered'
            ELSE 'partially_delivered'
        END,
        updated_at = now()
    WHERE id = p_order_id
    RETURNING amount_paid, total_amount INTO v_new_amount_paid, v_new_total_amount;

    UPDATE public.sales_orders SET balance_due = v_new_total_amount - v_new_amount_paid WHERE id = p_order_id;

    -- Sync customer outstanding balance
    UPDATE public.customers SET balance_due = (
        SELECT COALESCE(SUM(balance_due), 0) FROM public.sales_orders
        WHERE customer_id = v_customer_id AND status != 'cancelled'
    ) WHERE id = v_customer_id;

    RETURN jsonb_build_object(
        'dispatch_id', v_dispatch_id,
        'payment_id', v_payment_id,
        'batch_total', v_batch_total,
        'order_id', p_order_id
    );
END;
$function$;
