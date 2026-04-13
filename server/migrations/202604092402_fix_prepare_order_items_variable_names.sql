-- Fix: Correct variable names in prepare_order_items_atomic
-- The v_item record only contains item_id and quantity from the JSONB input.
-- Product details need to be fetched separately and stored in different variables.

DROP FUNCTION IF EXISTS public.prepare_order_items_atomic(uuid, jsonb, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.prepare_order_items_atomic(
    p_order_id uuid,
    p_items jsonb,
    p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_item RECORD;
    v_source_state TEXT;
    v_factory_id UUID;
    v_product_id UUID;
    v_cap_id UUID;
    v_inner_id UUID;
    v_include_inner BOOLEAN;
    v_unit_type TEXT;
    v_available_stock INT;
    v_balance RECORD;
    v_to_reserve INT;
    v_reserved_total INT := 0;
    v_main_factory_id UUID := '7ec2471f-c1c4-4603-9181-0cbde159420b';
BEGIN
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INT) 
    LOOP
        -- Get order item details including cap_id
        SELECT soi.product_id, soi.cap_id, soi.unit_type, soi.include_inner, soi.inner_id,
               COALESCE(p.factory_id, c.factory_id, v_main_factory_id) as factory_id
        INTO v_product_id, v_cap_id, v_unit_type, v_include_inner, v_inner_id, v_factory_id
        FROM public.sales_order_items soi
        LEFT JOIN public.products p ON p.id = soi.product_id
        LEFT JOIN public.caps c ON c.id = soi.cap_id
        WHERE soi.id = v_item.item_id;

        IF v_product_id IS NOT NULL THEN
            -- PRODUCT LOGIC: reserve from stock_balances with specific cap_id if present
            IF v_unit_type = 'loose' THEN
                v_source_state := 'semi_finished';
            ELSIF v_unit_type = 'packet' THEN
                v_source_state := 'packed';
            ELSE
                v_source_state := 'finished';
            END IF;

            -- Check available stock for this specific combination
            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.stock_balances
            WHERE product_id = v_product_id
              AND state = v_source_state
              AND unit_type = v_unit_type
              AND (factory_id = v_factory_id OR factory_id IS NULL)
              AND (v_cap_id IS NULL OR cap_id = v_cap_id)
              AND (
                COALESCE(v_include_inner, FALSE) = FALSE
                OR (v_include_inner = TRUE AND (v_inner_id IS NULL OR inner_id = v_inner_id))
              );

            IF v_available_stock < v_item.quantity THEN
                RAISE EXCEPTION 'Insufficient physical stock for product %. Required: %, Available: % in state %', 
                    v_product_id, v_item.quantity, v_available_stock, v_source_state;
            END IF;

            -- Reserve from stock balances with matching combination
            v_reserved_total := 0;
            FOR v_balance IN
                SELECT id, quantity FROM public.stock_balances
                WHERE product_id = v_product_id
                  AND state = v_source_state
                  AND unit_type = v_unit_type
                  AND (factory_id = v_factory_id OR factory_id IS NULL)
                  AND (v_cap_id IS NULL OR cap_id = v_cap_id)
                  AND (
                    COALESCE(v_include_inner, FALSE) = FALSE
                    OR (v_include_inner = TRUE AND (v_inner_id IS NULL OR inner_id = v_inner_id))
                  )
                  AND quantity > 0
                ORDER BY quantity DESC
            LOOP
                EXIT WHEN v_reserved_total >= v_item.quantity;
                
                v_to_reserve := LEAST(v_balance.quantity, v_item.quantity - v_reserved_total);
                
                -- Move to reserved state
                UPDATE public.stock_balances
                SET quantity = quantity - v_to_reserve, updated_at = NOW()
                WHERE id = v_balance.id;
                
                -- Add to reserved stock (or create if doesn't exist)
                INSERT INTO public.stock_balances (
                    product_id, factory_id, quantity, state, unit_type, cap_id, inner_id, updated_at
                ) VALUES (
                    v_product_id, v_factory_id, v_to_reserve, 'reserved', v_unit_type, 
                    v_cap_id, v_inner_id, NOW()
                ) ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id)
                DO UPDATE SET
                    quantity = stock_balances.quantity + EXCLUDED.quantity,
                    updated_at = NOW();
                
                v_reserved_total := v_reserved_total + v_to_reserve;
            END LOOP;

        ELSIF v_cap_id IS NOT NULL THEN
            -- CAP LOGIC: reserve from cap_stock_balances
            v_source_state := 'semi_finished';

            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.cap_stock_balances
            WHERE cap_id = v_cap_id
              AND state = v_source_state
              AND unit_type = COALESCE(v_unit_type, 'loose')
              AND (factory_id = v_factory_id OR factory_id IS NULL);

            IF v_available_stock < v_item.quantity THEN
                RAISE EXCEPTION 'Insufficient cap stock for cap %. Required: %, Available: %', 
                    v_cap_id, v_item.quantity, v_available_stock;
            END IF;

            v_reserved_total := 0;
            FOR v_balance IN
                SELECT id, quantity FROM public.cap_stock_balances
                WHERE cap_id = v_cap_id
                  AND state = v_source_state
                  AND unit_type = COALESCE(v_unit_type, 'loose')
                  AND (factory_id = v_factory_id OR factory_id IS NULL)
                  AND quantity > 0
                ORDER BY quantity DESC
            LOOP
                EXIT WHEN v_reserved_total >= v_item.quantity;
                
                v_to_reserve := LEAST(v_balance.quantity, v_item.quantity - v_reserved_total);
                
                UPDATE public.cap_stock_balances
                SET quantity = quantity - v_to_reserve, updated_at = NOW()
                WHERE id = v_balance.id;
                
                INSERT INTO public.cap_stock_balances (
                    cap_id, factory_id, quantity, state, unit_type, updated_at
                ) VALUES (
                    v_cap_id, v_factory_id, v_to_reserve, 'reserved', 
                    COALESCE(v_unit_type, 'loose'), NOW()
                ) ON CONFLICT (cap_id, factory_id, state, unit_type)
                DO UPDATE SET
                    quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
                    updated_at = NOW();
                
                v_reserved_total := v_reserved_total + v_to_reserve;
            END LOOP;
        END IF;

        -- Update order item reservation status
        UPDATE public.sales_order_items
        SET quantity_reserved = quantity_reserved + v_item.quantity,
            is_prepared = (quantity_reserved + v_item.quantity) >= quantity,
            updated_at = NOW()
        WHERE id = v_item.item_id;
    END LOOP;

    -- Update overall order status
    UPDATE public.sales_orders
    SET status = CASE
        WHEN (SELECT EVERY(is_prepared) FROM public.sales_order_items WHERE order_id = p_order_id)
        THEN 'prepared'
        ELSE 'partially_prepared'
    END,
    updated_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'reserved_items', jsonb_array_length(p_items));
END;
$function$;