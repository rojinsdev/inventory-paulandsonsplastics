-- System Validation Functions: Add comprehensive validation and consistency checks
-- These functions help prevent and detect data inconsistencies

-- Function to validate order state transitions
CREATE OR REPLACE FUNCTION public.validate_order_state_transition(
    p_order_id uuid,
    p_target_state text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_current_state text;
    v_order_record RECORD;
    v_validation_result jsonb := jsonb_build_object('valid', false, 'errors', jsonb_build_array());
    v_errors text[] := ARRAY[]::text[];
BEGIN
    -- Get current order state and details
    SELECT status, customer_id, total_amount, balance_due 
    INTO v_current_state, v_order_record.customer_id, v_order_record.total_amount, v_order_record.balance_due
    FROM public.sales_orders 
    WHERE id = p_order_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Order not found');
    END IF;

    -- Define valid state transitions
    CASE v_current_state
        WHEN 'pending' THEN
            IF p_target_state NOT IN ('reserved', 'cancelled') THEN
                v_errors := array_append(v_errors, format('Cannot transition from pending to %s. Valid transitions: reserved, cancelled', p_target_state));
            END IF;
        WHEN 'reserved' THEN
            IF p_target_state NOT IN ('delivered', 'partially_delivered', 'cancelled') THEN
                v_errors := array_append(v_errors, format('Cannot transition from reserved to %s. Valid transitions: delivered, partially_delivered, cancelled', p_target_state));
            END IF;
        WHEN 'partially_delivered' THEN
            IF p_target_state NOT IN ('delivered', 'cancelled') THEN
                v_errors := array_append(v_errors, format('Cannot transition from partially_delivered to %s. Valid transitions: delivered, cancelled', p_target_state));
            END IF;
        WHEN 'delivered' THEN
            IF p_target_state != 'delivered' THEN
                v_errors := array_append(v_errors, 'Cannot change status of delivered order');
            END IF;
        WHEN 'cancelled' THEN
            IF p_target_state != 'cancelled' THEN
                v_errors := array_append(v_errors, 'Cannot change status of cancelled order');
            END IF;
        ELSE
            v_errors := array_append(v_errors, format('Unknown current state: %s', v_current_state));
    END CASE;

    -- Additional validations for specific transitions
    IF p_target_state = 'reserved' THEN
        -- Check if all items can be reserved (have sufficient stock)
        IF EXISTS (
            SELECT 1 FROM public.sales_order_items soi
            WHERE soi.order_id = p_order_id 
            AND soi.quantity > COALESCE(soi.quantity_reserved, 0)
        ) THEN
            -- This is actually OK - preparation can be partial
            -- v_errors := array_append(v_errors, 'Cannot reserve order: some items are not fully prepared');
        END IF;
    END IF;

    IF p_target_state IN ('delivered', 'partially_delivered') THEN
        -- Check if order has reserved stock
        IF NOT EXISTS (
            SELECT 1 FROM public.sales_order_items 
            WHERE order_id = p_order_id AND quantity_reserved > 0
        ) THEN
            v_errors := array_append(v_errors, 'Cannot deliver order: no items are reserved');
        END IF;
    END IF;

    -- Return validation result
    IF array_length(v_errors, 1) IS NULL THEN
        RETURN jsonb_build_object('valid', true, 'message', format('Transition from %s to %s is valid', v_current_state, p_target_state));
    ELSE
        RETURN jsonb_build_object(
            'valid', false, 
            'current_state', v_current_state,
            'target_state', p_target_state,
            'errors', array_to_json(v_errors)
        );
    END IF;
END;
$function$;

-- Function to validate stock consistency
CREATE OR REPLACE FUNCTION public.validate_stock_consistency(
    p_product_id uuid DEFAULT NULL,
    p_factory_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_inconsistencies jsonb := jsonb_build_array();
    v_stock_record RECORD;
    v_negative_count int := 0;
    v_total_checked int := 0;
BEGIN
    -- Check for negative stock quantities
    FOR v_stock_record IN
        SELECT product_id, factory_id, state, unit_type, cap_id, inner_id, quantity
        FROM public.stock_balances
        WHERE (p_product_id IS NULL OR product_id = p_product_id)
        AND (p_factory_id IS NULL OR factory_id = p_factory_id)
        AND quantity < 0
    LOOP
        v_inconsistencies := v_inconsistencies || jsonb_build_object(
            'type', 'negative_stock',
            'product_id', v_stock_record.product_id,
            'factory_id', v_stock_record.factory_id,
            'state', v_stock_record.state,
            'unit_type', v_stock_record.unit_type,
            'cap_id', v_stock_record.cap_id,
            'inner_id', v_stock_record.inner_id,
            'quantity', v_stock_record.quantity
        );
        v_negative_count := v_negative_count + 1;
    END LOOP;

    -- Check for orphaned production requests
    FOR v_stock_record IN
        SELECT pr.id, pr.product_id, pr.cap_id, pr.status, pr.sales_order_id
        FROM public.production_requests pr
        LEFT JOIN public.sales_orders so ON so.id = pr.sales_order_id
        WHERE pr.status = 'pending' 
        AND (so.id IS NULL OR so.status IN ('delivered', 'cancelled'))
        AND (p_product_id IS NULL OR pr.product_id = p_product_id)
        LIMIT 10 -- Limit to avoid huge results
    LOOP
        v_inconsistencies := v_inconsistencies || jsonb_build_object(
            'type', 'orphaned_production_request',
            'request_id', v_stock_record.id,
            'product_id', v_stock_record.product_id,
            'cap_id', v_stock_record.cap_id,
            'sales_order_id', v_stock_record.sales_order_id
        );
    END LOOP;

    -- Count total records checked
    SELECT COUNT(*) INTO v_total_checked
    FROM public.stock_balances
    WHERE (p_product_id IS NULL OR product_id = p_product_id)
    AND (p_factory_id IS NULL OR factory_id = p_factory_id);

    RETURN jsonb_build_object(
        'total_checked', v_total_checked,
        'negative_stock_count', v_negative_count,
        'inconsistencies_found', jsonb_array_length(v_inconsistencies),
        'inconsistencies', v_inconsistencies,
        'status', CASE WHEN jsonb_array_length(v_inconsistencies) = 0 THEN 'healthy' ELSE 'issues_found' END
    );
END;
$function$;

-- Function to validate order item consistency
CREATE OR REPLACE FUNCTION public.validate_order_items_consistency(
    p_order_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_issues jsonb := jsonb_build_array();
    v_item_record RECORD;
    v_order_status text;
BEGIN
    -- Get order status
    SELECT status INTO v_order_status FROM public.sales_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Order not found');
    END IF;

    -- Check each order item for consistency issues
    FOR v_item_record IN
        SELECT soi.id, soi.product_id, soi.cap_id, soi.quantity, 
               soi.quantity_reserved, soi.quantity_shipped, soi.is_prepared,
               soi.unit_type, soi.include_inner, soi.inner_id
        FROM public.sales_order_items soi
        WHERE soi.order_id = p_order_id
    LOOP
        -- Check for over-reservation
        IF v_item_record.quantity_reserved > v_item_record.quantity THEN
            v_issues := v_issues || jsonb_build_object(
                'type', 'over_reserved',
                'item_id', v_item_record.id,
                'quantity', v_item_record.quantity,
                'quantity_reserved', v_item_record.quantity_reserved
            );
        END IF;

        -- Check for over-shipment
        IF v_item_record.quantity_shipped > v_item_record.quantity THEN
            v_issues := v_issues || jsonb_build_object(
                'type', 'over_shipped',
                'item_id', v_item_record.id,
                'quantity', v_item_record.quantity,
                'quantity_shipped', v_item_record.quantity_shipped
            );
        END IF;

        -- Check for shipping without reservation
        IF v_item_record.quantity_shipped > v_item_record.quantity_reserved THEN
            v_issues := v_issues || jsonb_build_object(
                'type', 'shipped_without_reservation',
                'item_id', v_item_record.id,
                'quantity_reserved', v_item_record.quantity_reserved,
                'quantity_shipped', v_item_record.quantity_shipped
            );
        END IF;

        -- Check for missing cap_id when required
        IF v_item_record.product_id IS NOT NULL 
           AND v_item_record.unit_type IN ('packet', 'bundle') 
           AND v_item_record.cap_id IS NULL THEN
            v_issues := v_issues || jsonb_build_object(
                'type', 'missing_required_cap',
                'item_id', v_item_record.id,
                'product_id', v_item_record.product_id,
                'unit_type', v_item_record.unit_type
            );
        END IF;

        -- Check prepared status consistency
        IF v_item_record.is_prepared AND v_item_record.quantity_reserved < v_item_record.quantity THEN
            v_issues := v_issues || jsonb_build_object(
                'type', 'prepared_but_not_reserved',
                'item_id', v_item_record.id,
                'quantity', v_item_record.quantity,
                'quantity_reserved', v_item_record.quantity_reserved
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'order_id', p_order_id,
        'order_status', v_order_status,
        'issues_found', jsonb_array_length(v_issues),
        'issues', v_issues,
        'status', CASE WHEN jsonb_array_length(v_issues) = 0 THEN 'consistent' ELSE 'issues_found' END
    );
END;
$function$;

-- Function to get system health summary
CREATE OR REPLACE FUNCTION public.get_system_health_summary() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_health_summary jsonb;
    v_pending_orders int;
    v_reserved_orders int;
    v_pending_requests int;
    v_negative_stock_count int;
    v_total_stock_entries int;
BEGIN
    -- Count orders by status
    SELECT COUNT(*) INTO v_pending_orders FROM public.sales_orders WHERE status = 'pending';
    SELECT COUNT(*) INTO v_reserved_orders FROM public.sales_orders WHERE status = 'reserved';
    
    -- Count pending production requests
    SELECT COUNT(*) INTO v_pending_requests FROM public.production_requests WHERE status = 'pending';
    
    -- Count stock issues
    SELECT COUNT(*) INTO v_negative_stock_count FROM public.stock_balances WHERE quantity < 0;
    SELECT COUNT(*) INTO v_total_stock_entries FROM public.stock_balances;

    v_health_summary := jsonb_build_object(
        'timestamp', NOW(),
        'orders', jsonb_build_object(
            'pending', v_pending_orders,
            'reserved', v_reserved_orders
        ),
        'production_requests', jsonb_build_object(
            'pending', v_pending_requests
        ),
        'stock', jsonb_build_object(
            'total_entries', v_total_stock_entries,
            'negative_entries', v_negative_stock_count,
            'health_percentage', CASE WHEN v_total_stock_entries > 0 
                THEN ROUND(((v_total_stock_entries - v_negative_stock_count)::numeric / v_total_stock_entries) * 100, 2)
                ELSE 100 
            END
        ),
        'overall_status', CASE 
            WHEN v_negative_stock_count = 0 THEN 'healthy'
            WHEN v_negative_stock_count < 10 THEN 'warning'
            ELSE 'critical'
        END
    );

    RETURN v_health_summary;
END;
$function$;

-- Add helpful comments
COMMENT ON FUNCTION public.validate_order_state_transition IS 'Validates if an order state transition is allowed and safe';
COMMENT ON FUNCTION public.validate_stock_consistency IS 'Checks for stock inconsistencies like negative quantities and orphaned records';
COMMENT ON FUNCTION public.validate_order_items_consistency IS 'Validates consistency of order items (quantities, reservations, etc.)';
COMMENT ON FUNCTION public.get_system_health_summary IS 'Provides a quick health check summary of the entire system';