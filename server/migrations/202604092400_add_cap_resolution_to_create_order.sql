-- Fix: Add cap resolution to create_order_atomic for tub+cap combinations
-- When ordering tubs in packet/bundle unit types, the system should:
-- 1. Resolve the cap_id from product_templates.cap_template_id
-- 2. Find the matching cap based on template and product color
-- 3. Store the resolved cap_id on sales_order_items
-- 4. Use the specific cap in stock availability checks
-- This ensures accurate stock counting and proper production requests.

DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, text, text, uuid, jsonb, text) CASCADE;

CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_customer_id uuid,
    p_delivery_date text,
    p_notes text,
    p_user_id uuid,
    p_items jsonb,
    p_order_date text
) RETURNS jsonb
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
    v_target_inner_id UUID;
    v_cap_template_id UUID;
    v_resolved_cap_id UUID;
BEGIN
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

    SELECT balance_due, credit_limit INTO v_customer_balance, v_customer_limit
    FROM public.customers WHERE id = p_customer_id;

    IF (COALESCE(v_customer_balance, 0) + v_total_amount) > COALESCE(v_customer_limit, 999999999) THEN
        RAISE EXCEPTION 'Order blocked: Total balance with this order (%) would exceed credit limit (%)',
            (COALESCE(v_customer_balance, 0) + v_total_amount), v_customer_limit;
    END IF;

    INSERT INTO public.sales_orders (
        customer_id, delivery_date, status, notes, created_by, order_date,
        total_amount, balance_due, amount_paid
    ) VALUES (
        p_customer_id,
        CASE WHEN p_delivery_date IS NULL OR p_delivery_date = '' THEN NULL ELSE p_delivery_date::DATE END,
        'pending', p_notes, p_user_id, p_order_date::DATE,
        v_total_amount, v_total_amount, 0
    ) RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID, cap_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN
    ) LOOP
        IF v_item.product_id IS NOT NULL THEN
            SELECT p.selling_price, p.factory_id, p.inner_id, p.color, pt.inner_template_id, pt.cap_template_id
            INTO v_resource_data
            FROM public.products p
            LEFT JOIN public.product_templates pt ON p.template_id = pt.id
            WHERE p.id = v_item.product_id;

            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);
            v_target_inner_id := NULL;
            v_resolved_cap_id := v_item.cap_id; -- Use explicitly selected cap_id if provided

            -- Resolve cap_id for tub orders that require caps (packet/bundle)
            IF v_resolved_cap_id IS NULL AND v_item.unit_type IN ('packet', 'bundle') AND v_resource_data.cap_template_id IS NOT NULL THEN
                -- Find matching cap for this template and product color
                SELECT id INTO v_resolved_cap_id
                FROM public.caps
                WHERE template_id = v_resource_data.cap_template_id
                  AND (color = v_resource_data.color OR color IS NULL)
                  AND (factory_id = v_factory_id OR factory_id IS NULL)
                ORDER BY 
                    CASE WHEN color = v_resource_data.color THEN 1 ELSE 2 END,
                    CASE WHEN factory_id = v_factory_id THEN 1 ELSE 2 END
                LIMIT 1;
            END IF;

            -- Resolve inner_id if include_inner is true
            IF v_item.include_inner = TRUE THEN
                -- Level 1: use product.inner_id directly
                v_target_inner_id := v_resource_data.inner_id;

                -- Level 2: resolve from existing packed stock (most qty first)
                IF v_target_inner_id IS NULL THEN
                    SELECT inner_id INTO v_target_inner_id
                    FROM public.stock_balances
                    WHERE product_id = v_item.product_id
                      AND inner_id IS NOT NULL
                      AND state IN ('packed', 'finished')
                      AND (factory_id = v_factory_id OR factory_id IS NULL)
                      AND (v_resolved_cap_id IS NULL OR cap_id = v_resolved_cap_id)
                    ORDER BY quantity DESC
                    LIMIT 1;
                END IF;

                -- Level 3: resolve from inner_template
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

            -- Stock check with specific cap and inner combination
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

        ELSIF v_item.cap_id IS NOT NULL THEN
            SELECT factory_id INTO v_resource_data FROM public.caps WHERE id = v_item.cap_id;
            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);

            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.cap_stock_balances
            WHERE cap_id = v_item.cap_id
              AND unit_type = COALESCE(v_item.unit_type, 'loose')
              AND state IN ('semi_finished', 'finished')
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