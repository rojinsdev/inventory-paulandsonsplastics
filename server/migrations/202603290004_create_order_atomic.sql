-- Migration: create_order_atomic
-- Created: 2026-03-29
-- Description: Atomic RPC for creating sales orders with items and demand signaling.

CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_customer_id UUID,
    p_delivery_date TEXT,
    p_notes TEXT,
    p_user_id UUID,
    p_items JSONB, -- Array of {product_id, quantity, unit_price, unit_type, include_inner}
    p_order_date TEXT
) RETURNS JSONB AS $$
DECLARE
    v_order_id UUID;
    v_item RECORD;
    v_product_data RECORD;
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
    v_main_factory_id UUID := '7ec2471f-c1c4-4603-9181-0cbde159420b'; -- Matches MAIN_FACTORY_ID in code
BEGIN
    -- 1. Create Sales Order
    INSERT INTO public.sales_orders (
        customer_id, delivery_date, status, notes, created_by, order_date
    ) VALUES (
        p_customer_id, p_delivery_date, 'pending', p_notes, p_user_id, p_order_date
    ) RETURNING id INTO v_order_id;

    -- 2. Process Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN
    ) LOOP
        -- Fetch Product and first matching template row
        SELECT 
            p.selling_price, p.factory_id, p.color, 
            p.items_per_bundle, p.items_per_packet, p.items_per_bag, p.items_per_box,
            pt.inner_template_id
        INTO v_product_data
        FROM public.products p
        LEFT JOIN public.product_templates pt ON pt.product_id = p.id
        WHERE p.id = v_item.product_id
        LIMIT 1;

        IF v_product_data.selling_price IS NULL AND v_product_data.factory_id IS NULL THEN
            RAISE EXCEPTION 'Product % not found', v_item.product_id;
        END IF;

        v_factory_id := COALESCE(v_product_data.factory_id, v_main_factory_id);

        -- Check Stock (Across all available factory balances)
        SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
        FROM public.stock_balances 
        WHERE product_id = v_item.product_id 
          AND unit_type = COALESCE(v_item.unit_type, 'bundle')
          AND state IN ('semi_finished', 'packed', 'finished')
          AND (factory_id = v_factory_id OR factory_id IS NULL);

        v_is_backordered := v_available_stock < v_item.quantity;

        -- Create Order Item
        INSERT INTO public.sales_order_items (
            order_id, product_id, quantity, quantity_prepared, quantity_reserved, 
            unit_type, unit_price, is_backordered, is_prepared
        ) VALUES (
            v_order_id, v_item.product_id, v_item.quantity, 0, 0, 
            COALESCE(v_item.unit_type, 'bundle'), 
            COALESCE(v_item.unit_price, v_product_data.selling_price, 0), 
            v_is_backordered, FALSE
        );

        -- Demand Signaling (Main Product)
        IF v_is_backordered THEN
            v_needed := v_item.quantity - v_available_stock;
            INSERT INTO public.production_requests (
                product_id, factory_id, quantity, unit_type, sales_order_id, status
            ) VALUES (
                v_item.product_id, v_factory_id, v_needed, COALESCE(v_item.unit_type, 'bundle'), v_order_id, 'pending'
            );
        END IF;

        -- 3. Handle Inners (Nested Demand Signaling)
        IF COALESCE(v_item.include_inner, FALSE) AND v_product_data.inner_template_id IS NOT NULL AND v_product_data.color IS NOT NULL THEN
            -- Find matching Inner
            SELECT id INTO v_inner_id
            FROM public.inners
            WHERE template_id = v_product_data.inner_template_id
              AND color = v_product_data.color
            LIMIT 1;

            IF v_inner_id IS NOT NULL THEN
                -- Calculate multiplier
                v_multiplier := CASE COALESCE(v_item.unit_type, 'bundle')
                    WHEN 'bundle' THEN COALESCE(v_product_data.items_per_bundle, 1)
                    WHEN 'packet' THEN COALESCE(v_product_data.items_per_packet, 1)
                    WHEN 'bag' THEN COALESCE(v_product_data.items_per_bag, 1)
                    WHEN 'box' THEN COALESCE(v_product_data.items_per_box, 1)
                    ELSE 1
                END;

                v_required_inners := v_item.quantity * v_multiplier;

                -- Check Inner Stock
                SELECT COALESCE(SUM(quantity), 0) INTO v_available_inners
                FROM public.inner_stock_balances
                WHERE inner_id = v_inner_id
                  AND (factory_id = v_factory_id OR factory_id IS NULL);

                -- Deduct available mathematically
                v_inner_deduction := LEAST(v_required_inners, v_available_inners);
                IF v_inner_deduction > 0 THEN
                    PERFORM public.adjust_inner_stock(v_inner_id, v_factory_id, -v_inner_deduction);
                END IF;

                -- Production Request for missing inners
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
    END LOOP;

    RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
