-- Migration: fix_process_partial_dispatch_for_caps
-- Created: 2026-04-03
-- Description: Updates process_partial_dispatch to support caps and correctly deduct reserved stock.

CREATE OR REPLACE FUNCTION public.process_partial_dispatch(
    p_order_id UUID,
    p_items JSONB,
    p_discount_type TEXT,
    p_discount_value NUMERIC,
    p_payment_mode TEXT,
    p_credit_deadline TIMESTAMP WITH TIME ZONE,
    p_initial_payment NUMERIC,
    p_notes TEXT,
    p_user_id UUID,
    p_payment_method TEXT DEFAULT 'cash'
) RETURNS JSONB AS $$
DECLARE
    v_dispatch_id UUID;
    v_subtotal NUMERIC := 0;
    v_batch_discount NUMERIC := 0;
    v_batch_total NUMERIC;
    v_item RECORD;
    v_current_item RECORD;
    v_customer_id UUID;
    v_balance RECORD;
BEGIN
    -- Validation: Check order exists
    SELECT customer_id INTO v_customer_id FROM public.sales_orders WHERE id = p_order_id;
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- 1. Create Dispatch Record
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        item_id UUID, 
        quantity INTEGER, 
        unit_price NUMERIC
    ) LOOP
        v_subtotal := v_subtotal + (v_item.quantity * v_item.unit_price);
    END LOOP;

    IF p_discount_type = 'percentage' THEN
        v_batch_discount := (v_subtotal * COALESCE(p_discount_value, 0)) / 100;
    ELSE
        v_batch_discount := COALESCE(p_discount_value, 0);
    END IF;
    v_batch_total := v_subtotal - v_batch_discount;

    INSERT INTO public.dispatch_records (
        order_id, subtotal, discount_value, total_amount, recorded_by, notes
    ) VALUES (
        p_order_id, v_subtotal, v_batch_discount, v_batch_total, p_user_id, p_notes
    ) RETURNING id INTO v_dispatch_id;

    -- 2. Process Items and Stock
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        item_id UUID, 
        quantity INTEGER, 
        unit_price NUMERIC
    ) LOOP
        DECLARE
            v_remaining_to_dispatch INT := v_item.quantity;
        BEGIN
            -- Fetch internal item data (handling both products and caps)
            SELECT 
                soi.product_id, 
                soi.cap_id,
                soi.unit_type,
                soi.quantity_shipped, 
                soi.quantity_reserved,
                COALESCE(p.factory_id, c.factory_id) as factory_id
            INTO v_current_item
            FROM public.sales_order_items soi
            LEFT JOIN public.products p ON p.id = soi.product_id
            LEFT JOIN public.caps c ON c.id = soi.cap_id
            WHERE soi.id = v_item.item_id;

            IF v_current_item.product_id IS NULL AND v_current_item.cap_id IS NULL THEN
                RAISE EXCEPTION 'Order item % not found', v_item.item_id;
            END IF;

            IF v_item.quantity > (v_current_item.quantity_reserved - v_current_item.quantity_shipped) THEN
                RAISE EXCEPTION 'Cannot dispatch % for item %. Only % reserved and ready.', 
                    v_item.quantity, v_item.item_id, (v_current_item.quantity_reserved - v_current_item.quantity_shipped);
            END IF;

            -- Update sales_order_items
            UPDATE public.sales_order_items
            SET quantity_shipped = quantity_shipped + v_item.quantity,
                unit_price = v_item.unit_price,
                is_prepared = (quantity_shipped + v_item.quantity) >= quantity
            WHERE id = v_item.item_id;

            -- Create link record
            INSERT INTO public.dispatch_items (dispatch_id, sales_order_item_id, quantity_shipped)
            VALUES (v_dispatch_id, v_item.item_id, v_item.quantity);

            -- Deduct from RESERVED stock across all possible rows (batches)
            IF v_current_item.cap_id IS NOT NULL THEN
                FOR v_balance IN 
                    SELECT id, quantity 
                    FROM public.cap_stock_balances 
                    WHERE cap_id = v_current_item.cap_id 
                      AND state = 'reserved' 
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, 'loose')
                      AND quantity > 0
                    ORDER BY quantity DESC
                LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    DECLARE
                        v_deduct_qty INT := LEAST(v_remaining_to_dispatch, v_balance.quantity);
                    BEGIN
                        UPDATE public.cap_stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
                        v_remaining_to_dispatch := v_remaining_to_dispatch - v_deduct_qty;
                    END;
                END LOOP;
            ELSE
                FOR v_balance IN 
                    SELECT id, quantity 
                    FROM public.stock_balances 
                    WHERE product_id = v_current_item.product_id 
                      AND state = 'reserved' 
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, '')
                      AND quantity > 0
                    ORDER BY quantity DESC
                LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    DECLARE
                        v_deduct_qty INT := LEAST(v_remaining_to_dispatch, v_balance.quantity);
                    BEGIN
                        UPDATE public.stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
                        v_remaining_to_dispatch := v_remaining_to_dispatch - v_deduct_qty;
                    END;
                END LOOP;
            END IF;

            IF v_remaining_to_dispatch > 0 THEN
                RAISE EXCEPTION 'Internal error: Insufficient reserved stock for item %. Need %, found % more.', 
                    v_item.item_id, v_item.quantity, v_remaining_to_dispatch;
            END IF;
        END;
    END LOOP;

    -- 3. Record Initial Payment (if any)
    IF p_initial_payment > 0 THEN
        INSERT INTO public.payments (
            sales_order_id, customer_id, amount, payment_method, notes, recorded_by
        ) VALUES (
            p_order_id, v_customer_id, p_initial_payment, COALESCE(p_payment_method, 'cash'),
            'Initial payment for dispatch ' || v_dispatch_id, p_user_id
        );
    END IF;

    -- 4. Update Order Level totals
    UPDATE public.sales_orders
    SET 
        subtotal = COALESCE(subtotal, 0) + v_subtotal,
        discount_value = COALESCE(discount_value, 0) + v_batch_discount,
        total_amount = COALESCE(total_amount, 0) + v_batch_total,
        amount_paid = COALESCE(amount_paid, 0) + COALESCE(p_initial_payment, 0),
        balance_due = (COALESCE(total_amount, 0) + v_batch_total) - (COALESCE(amount_paid, 0) + COALESCE(p_initial_payment, 0)),
        payment_mode = COALESCE(p_payment_mode, payment_mode),
        credit_deadline = COALESCE(p_credit_deadline, credit_deadline),
        status = CASE 
            WHEN (SELECT EVERY(quantity_shipped >= quantity) FROM public.sales_order_items WHERE order_id = p_order_id) 
            THEN 'delivered'
            ELSE 'partially_delivered'
        END,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'dispatch_id', v_dispatch_id,
        'batch_total', v_batch_total,
        'order_id', p_order_id,
        'status', (SELECT status FROM public.sales_orders WHERE id = p_order_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
