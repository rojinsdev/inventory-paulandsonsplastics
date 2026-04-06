-- Migration: update_create_order_atomic_for_caps
-- Created: 2026-04-01

CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_customer_id UUID,
    p_delivery_date TEXT,
    p_notes TEXT,
    p_user_id UUID,
    p_items JSONB, -- Array of {product_id, cap_id, quantity, unit_price, unit_type, include_inner}
    p_order_date TEXT
) RETURNS JSONB AS $$
DECLARE
    v_order_id UUID;
    v_item RECORD;
    v_resource_data RECORD;
    v_inner_id UUID;
    v_available_stock INT;
    v_is_backordered BOOLEAN;
    v_factory_id UUID;
    v_needed INT;
    v_multiplier INT;
    v_required_inners INT;
    v_available_inners INT;
    v_inner_deduction INT;
    v_missing_inners INT;
    v_main_factory_id UUID := '7ec2471f-c1c4-4603-9181-0cbde159420b';
BEGIN
    -- 1. Create Sales Order
    INSERT INTO public.sales_orders (
        customer_id, delivery_date, status, notes, created_by, order_date
    ) VALUES (
        p_customer_id, 
        NULLIF(p_delivery_date, '')::DATE, 
        'pending', 
        p_notes, 
        p_user_id, 
        p_order_date::DATE
    ) RETURNING id INTO v_order_id;

    -- 2. Process Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID, cap_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN
    ) LOOP
        
        -- Logic Branch: Product vs Cap
        IF v_item.product_id IS NOT NULL THEN
            -- PRODUCT LOGIC
            SELECT 
                p.selling_price, p.factory_id, p.color, 
                p.items_per_bundle, p.items_per_packet, p.items_per_bag, p.items_per_box,
                pt.inner_template_id
            INTO v_resource_data
            FROM public.products p
            LEFT JOIN public.product_templates pt ON pt.id = p.template_id
            WHERE p.id = v_item.product_id
            LIMIT 1;

            IF v_resource_data IS NULL THEN
                RAISE EXCEPTION 'Product % not found', v_item.product_id;
            END IF;

            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);

            -- Check Product Stock
            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.stock_balances 
            WHERE product_id = v_item.product_id 
              AND unit_type = COALESCE(v_item.unit_type, 'bundle')
              AND state IN ('semi_finished', 'packed', 'finished')
              AND (factory_id = v_factory_id OR factory_id IS NULL);

            v_is_backordered := v_available_stock < v_item.quantity;

            -- Create Order Item (Product)
            INSERT INTO public.sales_order_items (
                order_id, product_id, cap_id, quantity, quantity_prepared, quantity_reserved, 
                unit_type, unit_price, is_backordered, is_prepared
            ) VALUES (
                v_order_id, v_item.product_id, NULL, v_item.quantity, 0, 0, 
                COALESCE(v_item.unit_type, 'bundle'), 
                COALESCE(v_item.unit_price, v_resource_data.selling_price, 0), 
                v_is_backordered, FALSE
            );

            -- Production Request (Product)
            IF v_is_backordered THEN
                v_needed := v_item.quantity - v_available_stock;
                INSERT INTO public.production_requests (
                    product_id, cap_id, factory_id, quantity, unit_type, sales_order_id, status
                ) VALUES (
                    v_item.product_id, NULL, v_factory_id, v_needed, COALESCE(v_item.unit_type, 'bundle'), v_order_id, 'pending'
                );
            END IF;

            -- Handle Inners (Product Only)
            IF COALESCE(v_item.include_inner, FALSE) AND v_resource_data.inner_template_id IS NOT NULL AND v_resource_data.color IS NOT NULL THEN
                SELECT id INTO v_inner_id
                FROM public.inners
                WHERE template_id = v_resource_data.inner_template_id
                  AND color = v_resource_data.color
                LIMIT 1;

                IF v_inner_id IS NOT NULL THEN
                    v_multiplier := CASE COALESCE(v_item.unit_type, 'bundle')
                        WHEN 'bundle' THEN COALESCE(v_resource_data.items_per_bundle, 1)
                        WHEN 'packet' THEN COALESCE(v_resource_data.items_per_packet, 1)
                        WHEN 'bag' THEN COALESCE(v_resource_data.items_per_bag, 1)
                        WHEN 'box' THEN COALESCE(v_resource_data.items_per_box, 1)
                        ELSE 1
                    END;
                    v_required_inners := v_item.quantity * v_multiplier;

                    SELECT COALESCE(SUM(quantity), 0) INTO v_available_inners
                    FROM public.inner_stock_balances
                    WHERE inner_id = v_inner_id
                      AND (factory_id = v_factory_id OR factory_id IS NULL);

                    v_inner_deduction := LEAST(v_required_inners, v_available_inners);
                    IF v_inner_deduction > 0 THEN
                        PERFORM public.adjust_inner_stock(v_inner_id, v_factory_id, -v_inner_deduction);
                    END IF;

                    v_missing_inners := v_required_inners - v_available_inners;
                    IF v_missing_inners > 0 THEN
                        INSERT INTO public.production_requests (
                            inner_id, factory_id, quantity, unit_type, sales_order_id, status
                        ) VALUES (
                            v_inner_id, v_factory_id, v_missing_inners, 'loose', v_order_id, 'pending'
                        );
                    END IF;
                END IF;
            END IF;

        ELSIF v_item.cap_id IS NOT NULL THEN
            -- CAP LOGIC
            SELECT 
                c.factory_id
            INTO v_resource_data
            FROM public.caps c
            WHERE c.id = v_item.cap_id
            LIMIT 1;

            IF v_resource_data IS NULL THEN
                RAISE EXCEPTION 'Cap % not found', v_item.cap_id;
            END IF;

            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);

            -- Check Cap Stock (Standardized system)
            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.cap_stock_balances 
            WHERE cap_id = v_item.cap_id 
              AND unit_type = COALESCE(v_item.unit_type, 'loose')
              AND state IN ('finished')
              AND (factory_id = v_factory_id OR factory_id IS NULL);

            v_is_backordered := v_available_stock < v_item.quantity;

            -- Create Order Item (Cap)
            INSERT INTO public.sales_order_items (
                order_id, product_id, cap_id, quantity, quantity_prepared, quantity_reserved, 
                unit_type, unit_price, is_backordered, is_prepared
            ) VALUES (
                v_order_id, NULL, v_item.cap_id, v_item.quantity, 0, 0, 
                COALESCE(v_item.unit_type, 'loose'), 
                COALESCE(v_item.unit_price, 0), -- Manual or template price logic can go here
                v_is_backordered, FALSE
            );

            -- Production Request (Cap)
            IF v_is_backordered THEN
                v_needed := v_item.quantity - v_available_stock;
                INSERT INTO public.production_requests (
                    product_id, cap_id, factory_id, quantity, unit_type, sales_order_id, status
                ) VALUES (
                    NULL, v_item.cap_id, v_factory_id, v_needed, COALESCE(v_item.unit_type, 'loose'), v_order_id, 'pending'
                );
            END IF;

        ELSE
            RAISE EXCEPTION 'Item missing both product_id and cap_id';
        END IF;

    END LOOP;

    RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
