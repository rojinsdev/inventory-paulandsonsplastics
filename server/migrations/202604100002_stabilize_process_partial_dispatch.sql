-- Stabilization: Add comprehensive error handling and validation to process_partial_dispatch
-- This prevents partial dispatches and ensures payment/stock consistency

DROP FUNCTION IF EXISTS public.process_partial_dispatch(uuid, jsonb, text, numeric, text, date, numeric, text, uuid, text) CASCADE;

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
SECURITY DEFINER
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
    v_error_context TEXT := '';
    v_order_status TEXT;
    v_remaining_to_dispatch INT;
BEGIN
    -- Add comprehensive error handling with rollback safety
    BEGIN
        -- Pre-validation: Check order exists and is in valid state
        SELECT customer_id, status INTO v_customer_id, v_order_status 
        FROM public.sales_orders WHERE id = p_order_id;
        
        IF NOT FOUND THEN 
            RAISE EXCEPTION 'Order % not found', p_order_id; 
        END IF;
        
        IF v_order_status NOT IN ('reserved', 'partially_delivered') THEN
            RAISE EXCEPTION 'Cannot dispatch order in status: %. Order must be reserved or partially delivered.', v_order_status;
        END IF;

        -- Validate payment parameters
        IF p_payment_mode NOT IN ('cash', 'credit') THEN
            RAISE EXCEPTION 'Invalid payment mode: %. Must be cash or credit.', p_payment_mode;
        END IF;
        
        IF p_discount_type NOT IN ('percentage', 'fixed') THEN
            RAISE EXCEPTION 'Invalid discount type: %. Must be percentage or fixed.', p_discount_type;
        END IF;

        -- Pre-validation: Check all items and calculate subtotal
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INTEGER, unit_price NUMERIC) 
        LOOP
            IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
                RAISE EXCEPTION 'Invalid quantity: %. Quantity must be positive.', v_item.quantity;
            END IF;
            
            IF v_item.unit_price IS NULL OR v_item.unit_price < 0 THEN
                RAISE EXCEPTION 'Invalid unit price: %. Price must be non-negative.', v_item.unit_price;
            END IF;
            
            -- Validate item belongs to order and check reservation
            SELECT soi.product_id, soi.cap_id, soi.unit_type, soi.quantity_shipped,
                   soi.quantity_reserved, COALESCE(p.factory_id, c.factory_id) as factory_id,
                   soi.quantity as target_qty
            INTO v_current_item
            FROM public.sales_order_items soi
            LEFT JOIN public.products p ON p.id = soi.product_id
            LEFT JOIN public.caps c ON c.id = soi.cap_id
            WHERE soi.id = v_item.item_id AND soi.order_id = p_order_id;
            
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Order item % not found or does not belong to order %', v_item.item_id, p_order_id;
            END IF;

            IF v_item.quantity > (v_current_item.quantity_reserved - v_current_item.quantity_shipped) THEN
                RAISE EXCEPTION 'Cannot dispatch % for item %. Only % available (reserved: %, already shipped: %)',
                    v_item.quantity, v_item.item_id,
                    (v_current_item.quantity_reserved - v_current_item.quantity_shipped),
                    v_current_item.quantity_reserved, v_current_item.quantity_shipped;
            END IF;
            
            v_subtotal := v_subtotal + (v_item.quantity * v_item.unit_price);
        END LOOP;

        -- Calculate discount and total
        IF p_discount_type = 'percentage' THEN
            v_batch_discount := (v_subtotal * COALESCE(p_discount_value, 0)) / 100;
        ELSE
            v_batch_discount := COALESCE(p_discount_value, 0);
        END IF;
        v_batch_total := v_subtotal - v_batch_discount;

        -- Create dispatch record
        INSERT INTO public.dispatches (
            order_id, subtotal, discount_type, discount_value, total_amount,
            payment_mode, credit_deadline, notes, dispatched_by, dispatched_at
        ) VALUES (
            p_order_id, v_subtotal, p_discount_type, p_discount_value, v_batch_total,
            p_payment_mode, p_credit_deadline, p_notes, p_user_id, NOW()
        ) RETURNING id INTO v_dispatch_id;

        -- Process each dispatched item
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INTEGER, unit_price NUMERIC) 
        LOOP
            v_remaining_to_dispatch := v_item.quantity;
            v_error_context := format('Processing dispatch for item: %s, quantity: %s', v_item.item_id, v_item.quantity);
            
            SELECT soi.product_id, soi.cap_id, soi.unit_type, soi.quantity_shipped,
                   soi.quantity_reserved, COALESCE(p.factory_id, c.factory_id) as factory_id,
                   soi.quantity as target_qty
            INTO v_current_item
            FROM public.sales_order_items soi
            LEFT JOIN public.products p ON p.id = soi.product_id
            LEFT JOIN public.caps c ON c.id = soi.cap_id
            WHERE soi.id = v_item.item_id;

            -- Update sales order item
            UPDATE public.sales_order_items
            SET quantity_shipped = quantity_shipped + v_item.quantity,
                unit_price = v_item.unit_price,
                is_prepared = (quantity_shipped + v_item.quantity) >= v_current_item.target_qty
            WHERE id = v_item.item_id;

            -- Create dispatch item record
            INSERT INTO public.dispatch_items (dispatch_id, sales_order_item_id, quantity_shipped)
            VALUES (v_dispatch_id, v_item.item_id, v_item.quantity);

            -- Deduct from reserved stock and move to delivered (remove from system)
            IF v_current_item.cap_id IS NOT NULL THEN
                -- Handle cap stock
                v_error_context := format('Deducting cap stock: cap_id=%s, quantity=%s', v_current_item.cap_id, v_item.quantity);
                
                FOR v_balance IN
                    SELECT id, quantity FROM public.cap_stock_balances
                    WHERE cap_id = v_current_item.cap_id AND state = 'reserved'
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, 'loose')
                      AND quantity > 0 ORDER BY quantity DESC
                LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    
                    DECLARE v_to_deduct INT := LEAST(v_remaining_to_dispatch, v_balance.quantity);
                    BEGIN
                        UPDATE public.cap_stock_balances
                        SET quantity = quantity - v_to_deduct, updated_at = NOW()
                        WHERE id = v_balance.id;
                        
                        v_remaining_to_dispatch := v_remaining_to_dispatch - v_to_deduct;
                    END;
                END LOOP;
            ELSE
                -- Handle product stock
                v_error_context := format('Deducting product stock: product_id=%s, quantity=%s', v_current_item.product_id, v_item.quantity);
                
                FOR v_balance IN
                    SELECT id, quantity FROM public.stock_balances
                    WHERE product_id = v_current_item.product_id AND state = 'reserved'
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, 'bundle') 
                      AND quantity > 0 ORDER BY quantity DESC
                LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    
                    DECLARE v_to_deduct INT := LEAST(v_remaining_to_dispatch, v_balance.quantity);
                    BEGIN
                        UPDATE public.stock_balances
                        SET quantity = quantity - v_to_deduct, updated_at = NOW()
                        WHERE id = v_balance.id;
                        
                        v_remaining_to_dispatch := v_remaining_to_dispatch - v_to_deduct;
                    END;
                END LOOP;
            END IF;

            -- Verify all stock was deducted
            IF v_remaining_to_dispatch > 0 THEN
                RAISE EXCEPTION 'Failed to deduct all reserved stock for item %. Remaining: %', v_item.item_id, v_remaining_to_dispatch;
            END IF;
        END LOOP;

        -- Handle payment if initial payment provided
        IF p_initial_payment IS NOT NULL AND p_initial_payment > 0 THEN
            v_error_context := format('Processing payment: amount=%s, method=%s', p_initial_payment, p_payment_method);
            
            INSERT INTO public.payments (
                customer_id, order_id, dispatch_id, amount, payment_method, 
                payment_date, recorded_by
            ) VALUES (
                v_customer_id, p_order_id, v_dispatch_id, p_initial_payment, 
                COALESCE(p_payment_method, 'cash'), CURRENT_DATE, p_user_id
            ) RETURNING id INTO v_payment_id;
        END IF;

        -- Update customer balance
        v_error_context := 'Updating customer balance';
        SELECT balance_due INTO v_balance FROM public.customer_balances WHERE customer_id = v_customer_id;
        
        v_new_total_amount := COALESCE(v_balance.balance_due, 0) + v_batch_total;
        v_new_amount_paid := COALESCE(p_initial_payment, 0);

        INSERT INTO public.customer_balances (customer_id, balance_due, updated_at)
        VALUES (v_customer_id, v_new_total_amount - v_new_amount_paid, NOW())
        ON CONFLICT (customer_id) 
        DO UPDATE SET 
            balance_due = v_new_total_amount - v_new_amount_paid,
            updated_at = NOW();

        -- Update sales order status and totals
        v_error_context := 'Updating order status';
        UPDATE public.sales_orders 
        SET 
            status = CASE 
                WHEN (SELECT COUNT(*) FROM public.sales_order_items WHERE order_id = p_order_id AND quantity_shipped < quantity) = 0 
                THEN 'delivered'
                ELSE 'partially_delivered'
            END,
            total_amount = COALESCE(total_amount, 0) + v_batch_total,
            amount_paid = COALESCE(amount_paid, 0) + COALESCE(p_initial_payment, 0),
            balance_due = (COALESCE(total_amount, 0) + v_batch_total) - (COALESCE(amount_paid, 0) + COALESCE(p_initial_payment, 0)),
            delivered_at = CASE 
                WHEN (SELECT COUNT(*) FROM public.sales_order_items WHERE order_id = p_order_id AND quantity_shipped < quantity) = 0 
                THEN NOW() 
                ELSE delivered_at 
            END,
            updated_at = NOW()
        WHERE id = p_order_id;

        -- Return success response with details
        RETURN jsonb_build_object(
            'success', true,
            'dispatch_id', v_dispatch_id,
            'payment_id', v_payment_id,
            'subtotal', v_subtotal,
            'discount', v_batch_discount,
            'total', v_batch_total,
            'payment_amount', COALESCE(p_initial_payment, 0),
            'message', 'Dispatch processed successfully'
        );

    EXCEPTION WHEN OTHERS THEN
        -- Comprehensive error handling with context
        RAISE EXCEPTION 'Dispatch processing failed at: %. Error: %', v_error_context, SQLERRM;
    END;
END;
$function$;

-- Add helpful comment
COMMENT ON FUNCTION public.process_partial_dispatch IS 'Stabilized dispatch processing with comprehensive validation and error handling';