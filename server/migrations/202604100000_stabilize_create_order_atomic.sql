-- Stabilization: Remove complex auto-resolution and make cap selection mandatory
-- This eliminates the most common source of NULL cap_id issues
-- Since the UI already provides explicit cap selection, we can enforce it

DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, text, text, uuid, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, text, text, uuid, jsonb, date) CASCADE;

CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_customer_id uuid,
    p_delivery_date text,
    p_notes text,
    p_user_id uuid,
    p_items jsonb,
    p_order_date text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
    v_target_inner_id UUID;
    v_resolved_cap_id UUID;
    v_error_context TEXT := '';
BEGIN
    -- Add comprehensive error handling with rollback safety
    BEGIN
        -- Pre-validation: Check all items before starting transaction
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
            product_id UUID, cap_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN
        ) LOOP
            -- Validate required fields
            IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
                RAISE EXCEPTION 'Invalid quantity: %. Quantity must be positive.', v_item.quantity;
            END IF;
            
            -- For product orders requiring caps (packet/bundle), cap_id must be explicitly provided
            IF v_item.product_id IS NOT NULL AND v_item.unit_type IN ('packet', 'bundle') THEN
                IF v_item.cap_id IS NULL THEN
                    RAISE EXCEPTION 'Cap selection is required for % orders. Please select a cap for the product.', v_item.unit_type;
                END IF;
            END IF;
        END LOOP;

        -- Calculate total amount for credit limit check
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
            product_id UUID, cap_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN
        ) LOOP
            IF v_item.product_id IS NOT NULL THEN
                SELECT selling_price INTO v_resource_data FROM public.products WHERE id = v_item.product_id;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Product not found: %', v_item.product_id;
                END IF;
                v_total_amount := v_total_amount + (v_item.quantity * COALESCE(v_item.unit_price, v_resource_data.selling_price, 0));
            ELSIF v_item.cap_id IS NOT NULL THEN
                -- Validate cap exists
                IF NOT EXISTS(SELECT 1 FROM public.caps WHERE id = v_item.cap_id) THEN
                    RAISE EXCEPTION 'Cap not found: %', v_item.cap_id;
                END IF;
                v_total_amount := v_total_amount + (v_item.quantity * COALESCE(v_item.unit_price, 0));
            END IF;
        END LOOP;

        -- Credit limit validation
        SELECT balance_due, credit_limit INTO v_customer_balance, v_customer_limit
        FROM public.customers WHERE id = p_customer_id;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Customer not found: %', p_customer_id;
        END IF;

        IF (COALESCE(v_customer_balance, 0) + v_total_amount) > COALESCE(v_customer_limit, 999999999) THEN
            RAISE EXCEPTION 'Order blocked: Total balance with this order (%) would exceed credit limit (%)',
                (COALESCE(v_customer_balance, 0) + v_total_amount), v_customer_limit;
        END IF;

        -- Create sales order
        INSERT INTO public.sales_orders (
            customer_id, delivery_date, status, notes, created_by, order_date,
            total_amount, balance_due, amount_paid
        ) VALUES (
            p_customer_id,
            CASE WHEN p_delivery_date IS NULL OR p_delivery_date = '' THEN NULL ELSE p_delivery_date::DATE END,
            'pending', p_notes, p_user_id, p_order_date::DATE,
            v_total_amount, v_total_amount, 0
        ) RETURNING id INTO v_order_id;

        -- Process each item with simplified logic
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
            product_id UUID, cap_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN
        ) LOOP
            IF v_item.product_id IS NOT NULL THEN
                -- Product order processing
                v_error_context := format('Processing product order: product_id=%s, cap_id=%s, unit_type=%s', 
                                        v_item.product_id, v_item.cap_id, v_item.unit_type);
                
                SELECT p.selling_price, p.factory_id, p.inner_id, p.color, pt.inner_template_id
                INTO v_resource_data
                FROM public.products p
                LEFT JOIN public.product_templates pt ON p.template_id = pt.id
                WHERE p.id = v_item.product_id;

                v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);
                v_target_inner_id := NULL;
                v_resolved_cap_id := v_item.cap_id; -- Use explicitly provided cap_id (no auto-resolution)

                -- Simplified inner resolution (only if explicitly requested)
                IF v_item.include_inner = TRUE THEN
                    -- Level 1: use product.inner_id directly
                    v_target_inner_id := v_resource_data.inner_id;

                    -- Level 2: resolve from inner_template if no direct inner
                    IF v_target_inner_id IS NULL AND v_resource_data.inner_template_id IS NOT NULL THEN
                        SELECT id INTO v_target_inner_id
                        FROM public.inners
                        WHERE template_id = v_resource_data.inner_template_id
                          AND (color = v_resource_data.color OR color IS NULL)
                          AND (factory_id = v_factory_id OR factory_id IS NULL)
                        ORDER BY 
                            CASE WHEN color = v_resource_data.color THEN 1 ELSE 2 END,
                            CASE WHEN factory_id = v_factory_id THEN 1 ELSE 2 END
                        LIMIT 1;
                    END IF;
                END IF;

                -- Stock availability check with specific combination
                SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
                FROM public.stock_balances
                WHERE product_id = v_item.product_id
                  AND unit_type = COALESCE(v_item.unit_type, 'bundle')
                  AND state IN ('semi_finished', 'packed', 'finished')
                  AND (factory_id = v_factory_id OR factory_id IS NULL)
                  AND (v_resolved_cap_id IS NULL OR cap_id = v_resolved_cap_id)
                  AND (
                    COALESCE(v_item.include_inner, FALSE) = FALSE
                    OR (v_item.include_inner = TRUE AND (v_target_inner_id IS NULL OR inner_id = v_target_inner_id))
                  );

                v_is_backordered := v_available_stock < v_item.quantity;

                -- Create sales order item
                INSERT INTO public.sales_order_items (
                    order_id, product_id, cap_id, quantity, quantity_prepared, quantity_reserved,
                    unit_type, unit_price, is_backordered, is_prepared,
                    include_inner, inner_id
                ) VALUES (
                    v_order_id, v_item.product_id, v_resolved_cap_id, v_item.quantity, 0, 0,
                    COALESCE(v_item.unit_type, 'bundle'),
                    COALESCE(v_item.unit_price, v_resource_data.selling_price, 0),
                    v_is_backordered, FALSE,
                    COALESCE(v_item.include_inner, FALSE),
                    v_target_inner_id
                );

                -- Create production request if backordered
                IF v_is_backordered THEN
                    INSERT INTO public.production_requests (
                        product_id, cap_id, inner_id, factory_id, quantity, unit_type,
                        sales_order_id, status
                    ) VALUES (
                        v_item.product_id, v_resolved_cap_id, v_target_inner_id, v_factory_id,
                        v_item.quantity - v_available_stock, COALESCE(v_item.unit_type, 'bundle'),
                        v_order_id, 'pending'
                    );
                END IF;

            ELSIF v_item.cap_id IS NOT NULL THEN
                -- Cap-only order processing
                v_error_context := format('Processing cap order: cap_id=%s, unit_type=%s', 
                                        v_item.cap_id, v_item.unit_type);
                
                SELECT factory_id INTO v_resource_data FROM public.caps WHERE id = v_item.cap_id;
                v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);

                -- Check cap stock availability
                SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
                FROM public.cap_stock_balances
                WHERE cap_id = v_item.cap_id
                  AND unit_type = COALESCE(v_item.unit_type, 'loose')
                  AND state IN ('semi_finished', 'finished')
                  AND (factory_id = v_factory_id OR factory_id IS NULL);

                v_is_backordered := v_available_stock < v_item.quantity;

                -- Create sales order item for cap
                INSERT INTO public.sales_order_items (
                    order_id, cap_id, quantity, quantity_prepared, quantity_reserved,
                    unit_type, unit_price, is_backordered, is_prepared
                ) VALUES (
                    v_order_id, v_item.cap_id, v_item.quantity, 0, 0,
                    COALESCE(v_item.unit_type, 'loose'),
                    COALESCE(v_item.unit_price, 0),
                    v_is_backordered, FALSE
                );

                -- Create production request if backordered
                IF v_is_backordered THEN
                    INSERT INTO public.production_requests (
                        cap_id, factory_id, quantity, unit_type, sales_order_id, status
                    ) VALUES (
                        v_item.cap_id, v_factory_id, v_item.quantity - v_available_stock,
                        COALESCE(v_item.unit_type, 'loose'), v_order_id, 'pending'
                    );
                END IF;
            ELSE
                RAISE EXCEPTION 'Invalid item: must have either product_id or cap_id';
            END IF;
        END LOOP;

        -- Return success response
        RETURN jsonb_build_object(
            'success', true,
            'order_id', v_order_id,
            'total_amount', v_total_amount,
            'message', 'Order created successfully'
        );

    EXCEPTION WHEN OTHERS THEN
        -- Comprehensive error handling with context
        RAISE EXCEPTION 'Order creation failed at: %. Error: %', v_error_context, SQLERRM;
    END;
END;
$function$;

-- Add helpful comment
COMMENT ON FUNCTION public.create_order_atomic(uuid, text, text, uuid, jsonb, text) IS 'Stabilized order creation with mandatory cap selection and comprehensive error handling';