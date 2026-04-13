-- Strict include_inner for product stock:
--   explicit FALSE -> only stock_balances.inner_id IS NULL (packed/bundled without inner)
--   TRUE or NULL on payload -> with-inner path (default TRUE when JSON omits include_inner)
-- Aligns create_order availability + SOI row, prepare_order_items_atomic, process_partial_dispatch
-- reserved deduction, and TS prepare-stock-dimensions.

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
    v_line_include_inner BOOLEAN;
BEGIN
    BEGIN
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
            product_id UUID, cap_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN
        ) LOOP
            IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
                RAISE EXCEPTION 'Invalid quantity: %. Quantity must be positive.', v_item.quantity;
            END IF;

            IF v_item.product_id IS NOT NULL AND v_item.unit_type IN ('packet', 'bundle') THEN
                IF v_item.cap_id IS NULL THEN
                    RAISE EXCEPTION 'Cap selection is required for % orders. Please select a cap for the product.', v_item.unit_type;
                END IF;
            END IF;
        END LOOP;

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
                IF NOT EXISTS(SELECT 1 FROM public.caps WHERE id = v_item.cap_id) THEN
                    RAISE EXCEPTION 'Cap not found: %', v_item.cap_id;
                END IF;
                v_total_amount := v_total_amount + (v_item.quantity * COALESCE(v_item.unit_price, 0));
            END IF;
        END LOOP;

        SELECT balance_due, credit_limit INTO v_customer_balance, v_customer_limit
        FROM public.customers WHERE id = p_customer_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Customer not found: %', p_customer_id;
        END IF;

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
                v_error_context := format('Processing product order: product_id=%s, cap_id=%s, unit_type=%s',
                                        v_item.product_id, v_item.cap_id, v_item.unit_type);

                SELECT p.selling_price, p.factory_id, p.inner_id, p.color, pt.inner_template_id
                INTO v_resource_data
                FROM public.products p
                LEFT JOIN public.product_templates pt ON p.template_id = pt.id
                WHERE p.id = v_item.product_id;

                v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);
                v_target_inner_id := NULL;
                v_resolved_cap_id := v_item.cap_id;
                v_line_include_inner := COALESCE(v_item.include_inner, TRUE);

                IF v_line_include_inner THEN
                    v_target_inner_id := v_resource_data.inner_id;

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

                SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
                FROM public.stock_balances
                WHERE product_id = v_item.product_id
                  AND unit_type = COALESCE(v_item.unit_type, 'bundle')
                  AND state IN ('semi_finished', 'packed', 'finished')
                  AND (factory_id = v_factory_id OR factory_id IS NULL)
                  AND (v_resolved_cap_id IS NULL OR cap_id = v_resolved_cap_id)
                  AND (
                    (NOT v_line_include_inner AND inner_id IS NULL)
                    OR (v_line_include_inner AND (v_target_inner_id IS NULL OR inner_id = v_target_inner_id))
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
                    v_line_include_inner,
                    v_target_inner_id
                );

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
                v_error_context := format('Processing cap order: cap_id=%s, unit_type=%s',
                                        v_item.cap_id, v_item.unit_type);

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

        RETURN jsonb_build_object(
            'success', true,
            'order_id', v_order_id,
            'total_amount', v_total_amount,
            'message', 'Order created successfully'
        );

    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Order creation failed at: %. Error: %', v_error_context, SQLERRM;
    END;
END;
$function$;

COMMENT ON FUNCTION public.create_order_atomic(uuid, text, text, uuid, jsonb, text) IS 'Order creation: strict without-inner stock (inner_id NULL only); default include_inner TRUE when omitted; cap mandatory for packet/bundle';

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
    BEGIN
        SELECT status INTO v_order_status FROM public.sales_orders WHERE id = p_order_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Order not found: %', p_order_id;
        END IF;

        IF v_order_status NOT IN ('pending', 'reserved') THEN
            RAISE EXCEPTION 'Cannot prepare order in status: %. Order must be pending or reserved.', v_order_status;
        END IF;

        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INT)
        LOOP
            IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
                RAISE EXCEPTION 'Invalid quantity: %. Quantity must be positive.', v_item.quantity;
            END IF;

            IF NOT EXISTS(SELECT 1 FROM public.sales_order_items WHERE id = v_item.item_id AND order_id = p_order_id) THEN
                RAISE EXCEPTION 'Order item not found or does not belong to this order: %', v_item.item_id;
            END IF;
        END LOOP;

        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INT)
        LOOP
            v_error_context := format('Processing item: %s, quantity: %s', v_item.item_id, v_item.quantity);

            SELECT soi.product_id, soi.cap_id, soi.unit_type, soi.include_inner, soi.inner_id,
                   COALESCE(p.factory_id, c.factory_id, v_main_factory_id) as factory_id
            INTO v_product_id, v_cap_id, v_unit_type, v_include_inner, v_inner_id, v_factory_id
            FROM public.sales_order_items soi
            LEFT JOIN public.products p ON p.id = soi.product_id
            LEFT JOIN public.caps c ON c.id = soi.cap_id
            WHERE soi.id = v_item.item_id;

            IF v_product_id IS NOT NULL THEN
                v_error_context := format('Processing product reservation: product_id=%s, cap_id=%s, inner_id=%s, unit_type=%s',
                                        v_product_id, v_cap_id, v_inner_id, v_unit_type);

                IF v_unit_type = 'loose' THEN
                    v_source_state := 'semi_finished'::inventory_state;
                ELSIF v_unit_type = 'packet' THEN
                    v_source_state := 'packed'::inventory_state;
                ELSE
                    v_source_state := 'finished'::inventory_state;
                END IF;

                SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
                FROM public.stock_balances
                WHERE product_id = v_product_id
                  AND state = v_source_state
                  AND unit_type = v_unit_type
                  AND (factory_id = v_factory_id OR factory_id IS NULL)
                  AND (v_cap_id IS NULL OR cap_id = v_cap_id)
                  AND (
                    (v_include_inner = FALSE AND inner_id IS NULL)
                    OR (v_include_inner IS DISTINCT FROM FALSE AND (v_inner_id IS NULL OR inner_id = v_inner_id))
                  );

                IF v_available_stock < v_item.quantity THEN
                    RAISE EXCEPTION 'Insufficient physical stock for product %. Required: %, Available: % in state %. Combination: cap_id=%, inner_id=%',
                        v_product_id, v_item.quantity, v_available_stock, v_source_state, v_cap_id, v_inner_id;
                END IF;

                v_reserved_total := 0;
                FOR v_balance IN
                    SELECT id, quantity FROM public.stock_balances
                    WHERE product_id = v_product_id
                      AND state = v_source_state
                      AND unit_type = v_unit_type
                      AND (factory_id = v_factory_id OR factory_id IS NULL)
                      AND (v_cap_id IS NULL OR cap_id = v_cap_id)
                      AND (
                        (v_include_inner = FALSE AND inner_id IS NULL)
                        OR (v_include_inner IS DISTINCT FROM FALSE AND (v_inner_id IS NULL OR inner_id = v_inner_id))
                      )
                      AND quantity > 0
                    ORDER BY quantity DESC
                LOOP
                    EXIT WHEN v_reserved_total >= v_item.quantity;

                    v_to_reserve := LEAST(v_balance.quantity, v_item.quantity - v_reserved_total);

                    UPDATE public.stock_balances
                    SET quantity = quantity - v_to_reserve, updated_at = NOW()
                    WHERE id = v_balance.id;

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

                UPDATE public.sales_order_items
                SET quantity_reserved = quantity_reserved + v_reserved_total,
                    is_prepared = (quantity_reserved + v_reserved_total) >= quantity,
                    prepared_at = CASE WHEN (quantity_reserved + v_reserved_total) >= quantity THEN NOW() ELSE prepared_at END,
                    prepared_by = CASE WHEN (quantity_reserved + v_reserved_total) >= quantity THEN p_user_id ELSE prepared_by END
                WHERE id = v_item.item_id;

            ELSIF v_cap_id IS NOT NULL THEN
                v_error_context := format('Processing cap reservation: cap_id=%s, unit_type=%s', v_cap_id, v_unit_type);

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

                    UPDATE public.cap_stock_balances
                    SET quantity = quantity - v_to_reserve, updated_at = NOW()
                    WHERE id = v_balance.id;

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

        UPDATE public.sales_orders
        SET status = CASE
            WHEN (SELECT COUNT(*) FROM public.sales_order_items WHERE order_id = p_order_id AND NOT is_prepared) = 0
            THEN 'reserved'
            ELSE status
        END,
        updated_at = NOW()
        WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success', true,
            'order_id', p_order_id,
            'reserved_count', v_total_reserved,
            'message', format('Successfully reserved %s items', v_total_reserved)
        );

    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Order preparation failed at: %. Error: %', v_error_context, SQLERRM;
    END;
END;
$function$;

COMMENT ON FUNCTION public.prepare_order_items_atomic IS 'Prepare: strict without-inner (inner_id NULL only); legacy NULL include_inner treated as with-inner';

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
    v_error_context TEXT := '';
    v_order_status TEXT;
    v_remaining_to_dispatch INT;
    v_notes_enriched TEXT;
BEGIN
    BEGIN
        SELECT customer_id, status INTO v_customer_id, v_order_status
        FROM public.sales_orders WHERE id = p_order_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Order % not found', p_order_id;
        END IF;

        IF v_order_status NOT IN ('reserved', 'partially_delivered') THEN
            RAISE EXCEPTION 'Cannot dispatch order in status: %. Order must be reserved or partially delivered.', v_order_status;
        END IF;

        IF p_payment_mode NOT IN ('cash', 'credit') THEN
            RAISE EXCEPTION 'Invalid payment mode: %. Must be cash or credit.', p_payment_mode;
        END IF;

        IF p_discount_type NOT IN ('percentage', 'fixed') THEN
            RAISE EXCEPTION 'Invalid discount type: %. Must be percentage or fixed.', p_discount_type;
        END IF;

        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INTEGER, unit_price NUMERIC)
        LOOP
            IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
                RAISE EXCEPTION 'Invalid quantity: %. Quantity must be positive.', v_item.quantity;
            END IF;

            IF v_item.unit_price IS NULL OR v_item.unit_price < 0 THEN
                RAISE EXCEPTION 'Invalid unit price: %. Price must be non-negative.', v_item.unit_price;
            END IF;

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

        IF p_discount_type = 'percentage' THEN
            v_batch_discount := (v_subtotal * COALESCE(p_discount_value, 0)) / 100;
        ELSE
            v_batch_discount := COALESCE(p_discount_value, 0);
        END IF;
        v_batch_total := v_subtotal - v_batch_discount;

        v_notes_enriched := trim(both FROM concat_ws(' | ',
            NULLIF(trim(both FROM COALESCE(p_notes, '')), ''),
            format('discount:%s %s', p_discount_type, COALESCE(p_discount_value::text, '0')),
            format('payment_mode:%s', p_payment_mode),
            CASE WHEN p_credit_deadline IS NOT NULL THEN format('credit_deadline:%s', p_credit_deadline) END
        ));

        INSERT INTO public.dispatch_records (
            order_id, subtotal, discount_value, total_amount, recorded_by, notes, dispatch_date
        ) VALUES (
            p_order_id, v_subtotal, v_batch_discount, v_batch_total, p_user_id, v_notes_enriched, NOW()
        ) RETURNING id INTO v_dispatch_id;

        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INTEGER, unit_price NUMERIC)
        LOOP
            v_remaining_to_dispatch := v_item.quantity;
            v_error_context := format('Processing dispatch for item: %s, quantity: %s', v_item.item_id, v_item.quantity);

            SELECT soi.product_id, soi.cap_id, soi.unit_type, soi.quantity_shipped,
                   soi.quantity_reserved, COALESCE(p.factory_id, c.factory_id) as factory_id,
                   soi.quantity as target_qty, soi.include_inner, soi.inner_id
            INTO v_current_item
            FROM public.sales_order_items soi
            LEFT JOIN public.products p ON p.id = soi.product_id
            LEFT JOIN public.caps c ON c.id = soi.cap_id
            WHERE soi.id = v_item.item_id;

            UPDATE public.sales_order_items
            SET quantity_shipped = quantity_shipped + v_item.quantity,
                unit_price = v_item.unit_price,
                is_prepared = (quantity_shipped + v_item.quantity) >= v_current_item.target_qty
            WHERE id = v_item.item_id;

            INSERT INTO public.dispatch_items (dispatch_id, sales_order_item_id, quantity_shipped)
            VALUES (v_dispatch_id, v_item.item_id, v_item.quantity);

            IF v_current_item.cap_id IS NOT NULL THEN
                v_error_context := format('Deducting cap stock: cap_id=%s, quantity=%s', v_current_item.cap_id, v_item.quantity);

                FOR v_balance IN
                    SELECT id, quantity FROM public.cap_stock_balances
                    WHERE cap_id = v_current_item.cap_id AND state = 'reserved'
                      AND (
                          v_current_item.factory_id IS NULL
                          OR factory_id IS NULL
                          OR factory_id = v_current_item.factory_id
                      )
                      AND (
                          unit_type = COALESCE(v_current_item.unit_type, 'loose')
                          OR (
                              COALESCE(v_current_item.unit_type, 'loose') = 'bundle'
                              AND unit_type = 'loose'
                          )
                      )
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
                v_error_context := format('Deducting product stock: product_id=%s, quantity=%s', v_current_item.product_id, v_item.quantity);

                FOR v_balance IN
                    SELECT id, quantity FROM public.stock_balances
                    WHERE product_id = v_current_item.product_id AND state = 'reserved'
                      AND (
                          v_current_item.factory_id IS NULL
                          OR factory_id IS NULL
                          OR factory_id = v_current_item.factory_id
                      )
                      AND (
                          unit_type = COALESCE(v_current_item.unit_type, 'bundle')
                          OR (
                              COALESCE(v_current_item.unit_type, 'bundle') = 'bundle'
                              AND unit_type = 'loose'
                          )
                      )
                      AND (
                        (v_current_item.include_inner = FALSE AND inner_id IS NULL)
                        OR (v_current_item.include_inner IS DISTINCT FROM FALSE AND (v_current_item.inner_id IS NULL OR inner_id = v_current_item.inner_id))
                      )
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

            IF v_remaining_to_dispatch > 0 THEN
                RAISE EXCEPTION 'Failed to deduct all reserved stock for item %. Remaining: %', v_item.item_id, v_remaining_to_dispatch;
            END IF;
        END LOOP;

        IF p_initial_payment IS NOT NULL AND p_initial_payment > 0 THEN
            v_error_context := format('Processing payment: amount=%s, method=%s', p_initial_payment, p_payment_method);

            INSERT INTO public.payments (
                sales_order_id, customer_id, dispatch_id, amount, payment_method,
                payment_date, recorded_by
            ) VALUES (
                p_order_id, v_customer_id, v_dispatch_id, p_initial_payment,
                COALESCE(p_payment_method, 'cash'), NOW(), p_user_id
            ) RETURNING id INTO v_payment_id;
        END IF;

        v_error_context := 'Updating customer balance';
        UPDATE public.customers
        SET balance_due = COALESCE(balance_due, 0) + v_batch_total - COALESCE(p_initial_payment, 0),
            updated_at = NOW()
        WHERE id = v_customer_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Customer % not found for balance update', v_customer_id;
        END IF;

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
        RAISE EXCEPTION 'Dispatch processing failed at: %. Error: %', v_error_context, SQLERRM;
    END;
END;
$function$;

COMMENT ON FUNCTION public.process_partial_dispatch IS 'Dispatch: deduct reserved product rows matching SOI include_inner/inner_id (strict without-inner)';
