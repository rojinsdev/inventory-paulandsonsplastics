-- Migration: Harden Logistics and Financials (Order Creation, Dispatch, Inter-factory Transfer)
-- Created: 2026-04-04

-- 0. Schema Updates (Dependencies for hardened RPCs)
-- Add balance_due to customers table for atomic credit tracking
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS balance_due NUMERIC DEFAULT 0;

-- 1. Create/Harden transfer_stock_atomic for inter-factory logistics
CREATE OR REPLACE FUNCTION public.transfer_stock_atomic(
    p_product_id uuid, p_from_factory_id uuid, p_to_factory_id uuid, 
    p_quantity integer, p_state text, p_unit_type text, p_user_id uuid, 
    p_cap_id uuid DEFAULT NULL::uuid, p_inner_id text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_source_qty INT;
    v_transfer_id UUID := gen_random_uuid();
BEGIN
    -- 1. Validation
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Transfer quantity must be positive';
    END IF;

    IF p_from_factory_id = p_to_factory_id THEN
        RAISE EXCEPTION 'Source and target factories must be different';
    END IF;

    -- 2. Check source stock
    IF p_cap_id IS NOT NULL THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_source_qty
        FROM public.cap_stock_balances
        WHERE cap_id = p_cap_id
          AND factory_id = p_from_factory_id
          AND state = p_state
          AND unit_type = p_unit_type;
    ELSE
        SELECT COALESCE(SUM(quantity), 0) INTO v_source_qty
        FROM public.stock_balances
        WHERE product_id = p_product_id
          AND factory_id = p_from_factory_id
          AND state = p_state
          AND unit_type = p_unit_type
          AND (p_cap_id IS NULL OR cap_id = p_cap_id)
          AND (p_inner_id IS NULL OR inner_id = p_inner_id);
    END IF;

    IF v_source_qty < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock in source factory. Have %, need %', v_source_qty, p_quantity;
    END IF;

    -- 3. Deduct from Source
    IF p_cap_id IS NOT NULL THEN
        PERFORM public.adjust_stock(
            NULL, -- product_id
            p_from_factory_id,
            p_state,
            -p_quantity,
            p_cap_id,
            p_unit_type
        );
    ELSE
        PERFORM public.adjust_stock(
            p_product_id,
            p_from_factory_id,
            p_state,
            -p_quantity,
            NULL, -- cap_id
            p_unit_type,
            p_inner_id
        );
    END IF;

    -- 4. Add to Target
    IF p_cap_id IS NOT NULL THEN
        PERFORM public.adjust_stock(
            NULL, -- product_id
            p_to_factory_id,
            p_state,
            p_quantity,
            p_cap_id,
            p_unit_type
        );
    ELSE
        PERFORM public.adjust_stock(
            p_product_id,
            p_to_factory_id,
            p_state,
            p_quantity,
            NULL, -- cap_id
            p_unit_type,
            p_inner_id
        );
    END IF;

    -- 5. Record Transaction (Audit)
    INSERT INTO public.inventory_transactions (
        product_id, cap_id, factory_id, transaction_type, quantity,
        source_id, notes, user_id, state, unit_type
    ) VALUES (
        p_product_id, p_cap_id, p_from_factory_id, 'transfer_out', -p_quantity,
        v_transfer_id, 'Transfer to ' || p_to_factory_id, p_user_id, p_state, p_unit_type
    );

    INSERT INTO public.inventory_transactions (
        product_id, cap_id, factory_id, transaction_type, quantity,
        source_id, notes, user_id, state, unit_type
    ) VALUES (
        p_product_id, p_cap_id, p_to_factory_id, 'transfer_in', p_quantity,
        v_transfer_id, 'Transfer from ' || p_from_factory_id, p_user_id, p_state, p_unit_type
    );

    RETURN jsonb_build_object('success', true, 'transfer_id', v_transfer_id);
END;
$function$;


-- 2. Harden create_order_atomic with Credit Limit Enforcement
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_customer_id uuid, p_delivery_date text, p_notes text, 
    p_user_id uuid, p_items jsonb, p_order_date text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 AS $function$
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
BEGIN
    -- 1. Pre-calculate total amount and validate pricing
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID, cap_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN
    ) LOOP
        IF v_item.product_id IS NOT NULL THEN
            SELECT selling_price INTO v_resource_data FROM public.products WHERE id = v_item.product_id;
            v_total_amount := v_total_amount + (v_item.quantity * COALESCE(v_item.unit_price, v_resource_data.selling_price, 0));
        ELSIF v_item.cap_id IS NOT NULL THEN
            v_total_amount := v_total_amount + (v_item.quantity * COALESCE(v_item.unit_price, 0));
        END IF;
    END LOOP;

    -- 2. Validate Credit Limit
    SELECT balance_due, credit_limit INTO v_customer_balance, v_customer_limit 
    FROM public.customers WHERE id = p_customer_id;

    IF (COALESCE(v_customer_balance, 0) + v_total_amount) > COALESCE(v_customer_limit, 999999999) THEN
        RAISE EXCEPTION 'Order blocked: Total balance with this order (%) would exceed credit limit (%)', 
            (COALESCE(v_customer_balance, 0) + v_total_amount), v_customer_limit;
    END IF;

    -- 3. Create Sales Order
    INSERT INTO public.sales_orders (
        customer_id, delivery_date, status, notes, created_by, order_date,
        total_amount, balance_due, amount_paid
    ) VALUES (
        p_customer_id, 
        CASE WHEN p_delivery_date IS NULL OR p_delivery_date = '' THEN NULL ELSE p_delivery_date::DATE END, 
        'pending', p_notes, p_user_id, p_order_date::DATE,
        v_total_amount, v_total_amount, 0
    ) RETURNING id INTO v_order_id;

    -- 4. Process Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID, cap_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN
    ) LOOP
        IF v_item.product_id IS NOT NULL THEN
            SELECT selling_price, factory_id INTO v_resource_data
            FROM public.products WHERE id = v_item.product_id;
            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);

            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.stock_balances 
            WHERE product_id = v_item.product_id 
              AND unit_type = COALESCE(v_item.unit_type, 'bundle')
              AND state IN ('semi_finished', 'packed', 'finished')
              AND (factory_id = v_factory_id OR factory_id IS NULL);

            v_is_backordered := v_available_stock < v_item.quantity;

            INSERT INTO public.sales_order_items (
                order_id, product_id, quantity, quantity_prepared, quantity_reserved, 
                unit_type, unit_price, is_backordered, is_prepared
            ) VALUES (
                v_order_id, v_item.product_id, v_item.quantity, 0, 0, 
                COALESCE(v_item.unit_type, 'bundle'), 
                COALESCE(v_item.unit_price, v_resource_data.selling_price, 0), 
                v_is_backordered, FALSE
            );
        ELSIF v_item.cap_id IS NOT NULL THEN
            SELECT factory_id INTO v_resource_data FROM public.caps WHERE id = v_item.cap_id;
            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);

            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.cap_stock_balances 
            WHERE cap_id = v_item.cap_id 
              AND unit_type = COALESCE(v_item.unit_type, 'loose')
              AND state IN ('finished')
              AND (factory_id = v_factory_id OR factory_id IS NULL);

            v_is_backordered := v_available_stock < v_item.quantity;

            INSERT INTO public.sales_order_items (
                order_id, cap_id, quantity, quantity_prepared, quantity_reserved, 
                unit_type, unit_price, is_backordered, is_prepared
            ) VALUES (
                v_order_id, v_item.cap_id, v_item.quantity, 0, 0, 
                COALESCE(v_item.unit_type, 'loose'), 
                COALESCE(v_item.unit_price, 0), 
                v_is_backordered, FALSE
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'total_amount', v_total_amount);
END;
$function$;


-- 3. Harden process_partial_dispatch with Balance Synchronization
CREATE OR REPLACE FUNCTION public.process_partial_dispatch(
    p_order_id uuid, p_items jsonb, p_discount_type text, 
    p_discount_value numeric, p_payment_mode text, p_credit_deadline date, 
    p_initial_payment numeric, p_notes text, p_user_id uuid, 
    p_payment_method text DEFAULT 'cash'::text
)
 RETURNS jsonb
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

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INTEGER, unit_price NUMERIC) LOOP
        v_subtotal := v_subtotal + (v_item.quantity * v_item.unit_price);
    END LOOP;

    IF p_discount_type = 'percentage' THEN v_batch_discount := (v_subtotal * COALESCE(p_discount_value, 0)) / 100;
    ELSE v_batch_discount := COALESCE(p_discount_value, 0); END IF;
    v_batch_total := v_subtotal - v_batch_discount;

    INSERT INTO public.dispatch_records (
        order_id, subtotal, discount_value, total_amount, recorded_by, notes
    ) VALUES (
        p_order_id, v_subtotal, v_batch_discount, v_batch_total, p_user_id, p_notes
    ) RETURNING id INTO v_dispatch_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INTEGER, unit_price NUMERIC) LOOP
        DECLARE v_remaining_to_dispatch INT := v_item.quantity;
        BEGIN
            SELECT soi.product_id, soi.cap_id, soi.unit_type, soi.quantity_shipped, 
                   soi.quantity_reserved, COALESCE(p.factory_id, c.factory_id) as factory_id, soi.quantity as target_qty
            INTO v_current_item FROM public.sales_order_items soi
            LEFT JOIN public.products p ON p.id = soi.product_id
            LEFT JOIN public.caps c ON c.id = soi.cap_id WHERE soi.id = v_item.item_id;

            IF v_item.quantity > (v_current_item.quantity_reserved - v_current_item.quantity_shipped) THEN
                RAISE EXCEPTION 'Cannot dispatch % for item %. Only % reserved.', v_item.quantity, v_item.item_id, (v_current_item.quantity_reserved - v_current_item.quantity_shipped);
            END IF;

            UPDATE public.sales_order_items SET quantity_shipped = quantity_shipped + v_item.quantity, 
                   unit_price = v_item.unit_price, is_prepared = (quantity_shipped + v_item.quantity) >= v_current_item.target_qty
            WHERE id = v_item.item_id;

            INSERT INTO public.dispatch_items (dispatch_id, sales_order_item_id, quantity_shipped)
            VALUES (v_dispatch_id, v_item.item_id, v_item.quantity);

            IF v_current_item.cap_id IS NOT NULL THEN
                FOR v_balance IN SELECT id, quantity FROM public.cap_stock_balances 
                    WHERE cap_id = v_current_item.cap_id AND state = 'reserved' 
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, 'loose') AND quantity > 0 ORDER BY quantity DESC LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    UPDATE public.cap_stock_balances SET quantity = quantity - LEAST(v_remaining_to_dispatch, v_balance.quantity), last_updated = NOW() WHERE id = v_balance.id;
                    v_remaining_to_dispatch := v_remaining_to_dispatch - LEAST(v_remaining_to_dispatch, v_balance.quantity);
                END LOOP;
            ELSE
                FOR v_balance IN SELECT id, quantity FROM public.stock_balances 
                    WHERE product_id = v_current_item.product_id AND state = 'reserved' 
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, '') AND quantity > 0 ORDER BY quantity DESC LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    UPDATE public.stock_balances SET quantity = quantity - LEAST(v_remaining_to_dispatch, v_balance.quantity), last_updated = NOW() WHERE id = v_balance.id;
                    v_remaining_to_dispatch := v_remaining_to_dispatch - LEAST(v_remaining_to_dispatch, v_balance.quantity);
                END LOOP;
            END IF;
        END;
    END LOOP;

    IF COALESCE(p_initial_payment, 0) > 0 THEN
        INSERT INTO public.payments (sales_order_id, customer_id, amount, payment_method, notes, recorded_by
        ) VALUES (p_order_id, v_customer_id, p_initial_payment, COALESCE(p_payment_method, 'cash'), 
                  'Initial payment for dispatch ' || v_dispatch_id, p_user_id) RETURNING id INTO v_payment_id;
    END IF;

    UPDATE public.sales_orders SET amount_paid = amount_paid + COALESCE(p_initial_payment, 0),
           payment_mode = COALESCE(p_payment_mode, payment_mode), credit_deadline = COALESCE(p_credit_deadline, credit_deadline),
           status = CASE WHEN (SELECT EVERY(quantity_shipped >= quantity) FROM public.sales_order_items WHERE order_id = p_order_id) THEN 'delivered' ELSE 'partially_delivered' END,
           updated_at = now() WHERE id = p_order_id RETURNING amount_paid, total_amount INTO v_new_amount_paid, v_new_total_amount;

    UPDATE public.sales_orders SET balance_due = v_new_total_amount - v_new_amount_paid WHERE id = p_order_id;
    UPDATE public.customers SET balance_due = (SELECT SUM(balance_due) FROM public.sales_orders WHERE customer_id = v_customer_id AND status != 'cancelled') WHERE id = v_customer_id;

    RETURN jsonb_build_object('dispatch_id', v_dispatch_id, 'payment_id', v_payment_id, 'batch_total', v_batch_total, 'order_id', p_order_id);
END;
$function$;
