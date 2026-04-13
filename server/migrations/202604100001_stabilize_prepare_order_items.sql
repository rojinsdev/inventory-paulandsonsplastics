-- Stabilization: Add comprehensive error handling and validation to prepare_order_items_atomic
-- This prevents partial stock reservations and ensures data consistency

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
    v_source_state inventory_state;
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
    v_total_reserved INT := 0;
    v_error_context TEXT := '';
    v_order_status TEXT;
BEGIN
    -- Add comprehensive error handling with rollback safety
    BEGIN
        -- Pre-validation: Check order exists and is in valid state
        SELECT status INTO v_order_status FROM public.sales_orders WHERE id = p_order_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Order not found: %', p_order_id;
        END IF;
        
        IF v_order_status NOT IN ('pending', 'reserved') THEN
            RAISE EXCEPTION 'Cannot prepare order in status: %. Order must be pending or reserved.', v_order_status;
        END IF;

        -- Pre-validation: Check all items exist and validate quantities
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INT) 
        LOOP
            IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
                RAISE EXCEPTION 'Invalid quantity: %. Quantity must be positive.', v_item.quantity;
            END IF;
            
            -- Validate item exists
            IF NOT EXISTS(SELECT 1 FROM public.sales_order_items WHERE id = v_item.item_id AND order_id = p_order_id) THEN
                RAISE EXCEPTION 'Order item not found or does not belong to this order: %', v_item.item_id;
            END IF;
        END LOOP;

        -- Process each item with comprehensive validation
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INT) 
        LOOP
            v_error_context := format('Processing item: %s, quantity: %s', v_item.item_id, v_item.quantity);
            
            -- Get order item details including cap_id and inner_id
            SELECT soi.product_id, soi.cap_id, soi.unit_type, soi.include_inner, soi.inner_id,
                   COALESCE(p.factory_id, c.factory_id, v_main_factory_id) as factory_id
            INTO v_product_id, v_cap_id, v_unit_type, v_include_inner, v_inner_id, v_factory_id
            FROM public.sales_order_items soi
            LEFT JOIN public.products p ON p.id = soi.product_id
            LEFT JOIN public.caps c ON c.id = soi.cap_id
            WHERE soi.id = v_item.item_id;

            IF v_product_id IS NOT NULL THEN
                -- PRODUCT LOGIC: reserve from stock_balances with specific cap_id if present
                v_error_context := format('Processing product reservation: product_id=%s, cap_id=%s, inner_id=%s, unit_type=%s', 
                                        v_product_id, v_cap_id, v_inner_id, v_unit_type);
                
                -- Determine source state based on unit type
                IF v_unit_type = 'loose' THEN
                    v_source_state := 'semi_finished'::inventory_state;
                ELSIF v_unit_type = 'packet' THEN
                    v_source_state := 'packed'::inventory_state;
                ELSE
                    v_source_state := 'finished'::inventory_state;
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
                    RAISE EXCEPTION 'Insufficient physical stock for product %. Required: %, Available: % in state %. Combination: cap_id=%, inner_id=%', 
                        v_product_id, v_item.quantity, v_available_stock, v_source_state, v_cap_id, v_inner_id;
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
                    
                    -- Create or update reserved stock entry
                    INSERT INTO public.stock_balances (
                        product_id, factory_id, state, unit_type, quantity, cap_id, inner_id, updated_at
                    ) VALUES (
                        v_product_id, v_factory_id, 'reserved'::inventory_state, v_unit_type, 
                        v_to_reserve, v_cap_id, v_inner_id, NOW()
                    )
                    ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id)
                    DO UPDATE SET 
                        quantity = stock_balances.quantity + v_to_reserve,
                        updated_at = NOW();
                    
                    v_reserved_total := v_reserved_total + v_to_reserve;
                END LOOP;

                -- Update sales order item
                UPDATE public.sales_order_items
                SET quantity_reserved = quantity_reserved + v_reserved_total,
                    is_prepared = (quantity_reserved + v_reserved_total) >= quantity,
                    prepared_at = CASE WHEN (quantity_reserved + v_reserved_total) >= quantity THEN NOW() ELSE prepared_at END,
                    prepared_by = CASE WHEN (quantity_reserved + v_reserved_total) >= quantity THEN p_user_id ELSE prepared_by END
                WHERE id = v_item.item_id;

            ELSIF v_cap_id IS NOT NULL THEN
                -- CAP LOGIC: reserve from cap_stock_balances
                v_error_context := format('Processing cap reservation: cap_id=%s, unit_type=%s', v_cap_id, v_unit_type);
                
                -- Check available cap stock
                SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
                FROM public.cap_stock_balances
                WHERE cap_id = v_cap_id
                  AND unit_type = COALESCE(v_unit_type, 'loose')
                  AND state IN ('semi_finished', 'finished')
                  AND (factory_id = v_factory_id OR factory_id IS NULL);

                IF v_available_stock < v_item.quantity THEN
                    RAISE EXCEPTION 'Insufficient cap stock for cap %. Required: %, Available: %',
                        v_cap_id, v_item.quantity, v_available_stock;
                END IF;

                -- Reserve cap stock (simplified for caps - move directly to reserved)
                v_reserved_total := 0;
                FOR v_balance IN
                    SELECT id, quantity FROM public.cap_stock_balances
                    WHERE cap_id = v_cap_id
                      AND unit_type = COALESCE(v_unit_type, 'loose')
                      AND state IN ('semi_finished', 'finished')
                      AND (factory_id = v_factory_id OR factory_id IS NULL)
                      AND quantity > 0
                    ORDER BY quantity DESC
                LOOP
                    EXIT WHEN v_reserved_total >= v_item.quantity;
                    
                    v_to_reserve := LEAST(v_balance.quantity, v_item.quantity - v_reserved_total);
                    
                    -- Deduct from source
                    UPDATE public.cap_stock_balances
                    SET quantity = quantity - v_to_reserve, updated_at = NOW()
                    WHERE id = v_balance.id;
                    
                    -- Add to reserved
                    INSERT INTO public.cap_stock_balances (
                        cap_id, factory_id, state, unit_type, quantity, updated_at
                    ) VALUES (
                        v_cap_id, v_factory_id, 'reserved', COALESCE(v_unit_type, 'loose'), 
                        v_to_reserve, NOW()
                    )
                    ON CONFLICT (cap_id, factory_id, state, unit_type)
                    DO UPDATE SET 
                        quantity = cap_stock_balances.quantity + v_to_reserve,
                        updated_at = NOW();
                    
                    v_reserved_total := v_reserved_total + v_to_reserve;
                END LOOP;

                -- Update sales order item
                UPDATE public.sales_order_items
                SET quantity_reserved = quantity_reserved + v_reserved_total,
                    is_prepared = (quantity_reserved + v_reserved_total) >= quantity,
                    prepared_at = CASE WHEN (quantity_reserved + v_reserved_total) >= quantity THEN NOW() ELSE prepared_at END,
                    prepared_by = CASE WHEN (quantity_reserved + v_reserved_total) >= quantity THEN p_user_id ELSE prepared_by END
                WHERE id = v_item.item_id;
            ELSE
                RAISE EXCEPTION 'Invalid order item: must have either product_id or cap_id. Item ID: %', v_item.item_id;
            END IF;

            v_total_reserved := v_total_reserved + v_reserved_total;
        END LOOP;

        -- Update order status if all items are prepared
        UPDATE public.sales_orders 
        SET status = CASE 
            WHEN (SELECT COUNT(*) FROM public.sales_order_items WHERE order_id = p_order_id AND NOT is_prepared) = 0 
            THEN 'reserved' 
            ELSE status 
        END,
        updated_at = NOW()
        WHERE id = p_order_id;

        -- Return success response with details
        RETURN jsonb_build_object(
            'success', true,
            'order_id', p_order_id,
            'reserved_count', v_total_reserved,
            'message', format('Successfully reserved %s items', v_total_reserved)
        );

    EXCEPTION WHEN OTHERS THEN
        -- Comprehensive error handling with context
        RAISE EXCEPTION 'Order preparation failed at: %. Error: %', v_error_context, SQLERRM;
    END;
END;
$function$;

-- Add helpful comment
COMMENT ON FUNCTION public.prepare_order_items_atomic IS 'Stabilized order preparation with comprehensive validation and error handling';