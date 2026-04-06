-- Fix create_order_atomic to remove automatic reservation, adhering to PM manual workflow.
-- Reservation should ONLY happen via the Order Preparation Screen (prepare_order_items_atomic).

CREATE OR REPLACE FUNCTION create_order_atomic(
    p_customer_id UUID,
    p_delivery_date TEXT,
    p_notes TEXT,
    p_user_id UUID,
    p_items JSONB,
    p_order_date DATE
) RETURNS JSONB AS $$
DECLARE
    l_order_id UUID;
    p_item JSONB;
    l_product_id UUID;
    l_factory_id UUID;
    l_available_total NUMERIC;
    l_is_backordered BOOLEAN;
    l_inner_id UUID;
    l_inner_needed BOOLEAN;
BEGIN
    -- 1. Create the Sales Order
    INSERT INTO sales_orders (
        customer_id, 
        delivery_date, 
        notes, 
        created_by, 
        status, 
        order_date,
        amount_paid,
        balance_due,
        total_amount
    ) VALUES (
        p_customer_id, 
        p_delivery_date, 
        p_notes, 
        p_user_id, 
        'pending', 
        p_order_date,
        0,
        0,
        0
    ) RETURNING id INTO l_order_id;

    -- 2. Process Items
    FOR p_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        l_product_id := (p_item->>'product_id')::UUID;
        l_inner_needed := COALESCE((p_item->>'include_inner')::BOOLEAN, FALSE);
        
        -- Get Product Metadata (Factory ID)
        SELECT factory_id INTO l_factory_id FROM products WHERE id = l_product_id;
        l_factory_id := COALESCE(l_factory_id, '7ec2471f-c1c4-4603-9181-0cbde159420b'); -- Fallback to main

        -- Check total available stock across all relevant states for this unit type
        -- We check finished (bundles), packed (packets), or semi_finished (loose)
        SELECT COALESCE(SUM(quantity), 0) INTO l_available_total
        FROM stock_balances
        WHERE product_id = l_product_id
          AND factory_id = l_factory_id
          AND unit_type = p_item->>'unit_type'
          AND state IN ('semi_finished', 'packed', 'finished');

        l_is_backordered := l_available_total < (p_item->'quantity')::NUMERIC;

        -- 3. Insert Sales Order Item (ALWAYS 0 reserved at this stage per PM rule)
        INSERT INTO sales_order_items (
            order_id,
            product_id,
            quantity,
            unit_type,
            unit_price,
            is_backordered,
            quantity_reserved,
            quantity_shipped,
            quantity_prepared
        ) VALUES (
            l_order_id,
            l_product_id,
            (p_item->'quantity')::NUMERIC,
            p_item->>'unit_type',
            COALESCE((p_item->'unit_price')::NUMERIC, 0),
            l_is_backordered,
            0, -- quantity_reserved
            0, -- quantity_shipped
            0  -- quantity_prepared
        );

        -- 4. Critical Demand Signaling: Create Production Request if Backordered
        IF l_is_backordered THEN
            INSERT INTO production_requests (
                product_id,
                factory_id,
                quantity,
                unit_type,
                sales_order_id,
                status
            ) VALUES (
                l_product_id,
                l_factory_id,
                (p_item->'quantity')::NUMERIC - l_available_total,
                p_item->>'unit_type',
                l_order_id,
                'pending'
            );

            -- Nested demand signaling for inners
            IF l_inner_needed THEN
                SELECT id INTO l_inner_id FROM products WHERE category_id = (SELECT id FROM categories WHERE name = 'Inners' LIMIT 1) LIMIT 1;
                IF l_inner_id IS NOT NULL THEN
                    INSERT INTO production_requests (
                        product_id,
                        factory_id,
                        quantity,
                        unit_type,
                        sales_order_id,
                        status
                    ) VALUES (
                        l_inner_id,
                        l_factory_id,
                        (p_item->'quantity')::NUMERIC - l_available_total,
                        'loose',
                        l_order_id,
                        'pending'
                    );
                END IF;
            END IF;
        END IF;
    END LOOP;

    -- Update order total amount (simplified for this migration)
    UPDATE sales_orders 
    SET total_amount = (SELECT SUM(quantity * unit_price) FROM sales_order_items WHERE order_id = l_order_id),
        balance_due = (SELECT SUM(quantity * unit_price) FROM sales_order_items WHERE order_id = l_order_id)
    WHERE id = l_order_id;

    RETURN jsonb_build_object('order_id', l_order_id);
END;
$$ LANGUAGE plpgsql;
