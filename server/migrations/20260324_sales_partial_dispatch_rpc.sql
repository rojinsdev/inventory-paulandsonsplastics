-- Fix process_partial_dispatch RPC
-- 1. Use COALESCE for financials to avoid NULL results
-- 2. Update subtotal, total_amount, balance_due on sales_orders
-- 3. Record initial payment in public.payments
-- 4. Explicitly transition to 'partially_delivered'

CREATE OR REPLACE FUNCTION public.process_partial_dispatch(
    p_order_id UUID,
    p_items JSONB, -- Array of {item_id, product_id, quantity, unit_price}
    p_discount_type TEXT,
    p_discount_value NUMERIC,
    p_payment_mode TEXT,
    p_credit_deadline DATE,
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
BEGIN
    -- Validation: Check order exists
    SELECT customer_id INTO v_customer_id FROM public.sales_orders WHERE id = p_order_id;
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- 1. Create Dispatch Record
    -- Calculate batch subtotal
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        item_id UUID, 
        quantity INTEGER, 
        unit_price NUMERIC
    ) LOOP
        v_subtotal := v_subtotal + (v_item.quantity * v_item.unit_price);
    END LOOP;

    -- Calculate batch discount
    IF p_discount_type = 'percentage' THEN
        v_batch_discount := (v_subtotal * COALESCE(p_discount_value, 0)) / 100;
    ELSE
        v_batch_discount := COALESCE(p_discount_value, 0);
    END IF;
    v_batch_total := v_subtotal - v_batch_discount;

    INSERT INTO public.dispatch_records (
        order_id, 
        subtotal, 
        discount_value, 
        total_amount, 
        recorded_by, 
        notes
    )
    VALUES (
        p_order_id, 
        v_subtotal, 
        v_batch_discount, 
        v_batch_total, 
        p_user_id, 
        p_notes
    )
    RETURNING id INTO v_dispatch_id;

    -- 2. Process Items and Stock
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        item_id UUID, 
        quantity INTEGER, 
        unit_price NUMERIC
    ) LOOP
        -- Fetch internal item data correctly
        SELECT 
            soi.product_id, 
            soi.unit_type,
            soi.quantity_shipped, 
            soi.quantity_prepared,
            p.factory_id,
            sb.cap_id as res_cap_id,
            sb.inner_id as res_inner_id
        INTO v_current_item
        FROM public.sales_order_items soi
        JOIN public.products p ON p.id = soi.product_id
        LEFT JOIN public.stock_balances sb ON (
            sb.product_id = soi.product_id AND
            sb.factory_id = p.factory_id AND
            sb.state = 'reserved' AND
            sb.unit_type = soi.unit_type
        )
        WHERE soi.id = v_item.item_id
        LIMIT 1;

        IF v_current_item.product_id IS NULL THEN
            RAISE EXCEPTION 'Order item % not found or product metadata missing', v_item.item_id;
        END IF;

        IF v_item.quantity > (v_current_item.quantity_prepared - v_current_item.quantity_shipped) THEN
            RAISE EXCEPTION 'Cannot dispatch % for item %. Only % prepared and ready.', 
                v_item.quantity, v_item.item_id, (v_current_item.quantity_prepared - v_current_item.quantity_shipped);
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

        -- Adjust Inventory Stock (Deduct from 'reserved' state)
        PERFORM public.adjust_stock(
            v_current_item.product_id,
            v_current_item.factory_id,
            'reserved'::public.inventory_state,
            -v_item.quantity,
            v_current_item.res_cap_id,
            v_current_item.res_inner_id,
            v_current_item.unit_type
        );
    END LOOP;

    -- 3. Record Initial Payment (if any)
    IF p_initial_payment > 0 THEN
        INSERT INTO public.payments (
            sales_order_id,
            customer_id,
            amount,
            payment_method,
            notes,
            recorded_by
        )
        VALUES (
            p_order_id,
            v_customer_id,
            p_initial_payment,
            COALESCE(p_payment_method, 'cash'),
            'Initial payment for dispatch ' || v_dispatch_id,
            p_user_id
        );
    END IF;

    -- 4. Update Order Level totals (ADDITIVE + COALESCE fixes)
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
