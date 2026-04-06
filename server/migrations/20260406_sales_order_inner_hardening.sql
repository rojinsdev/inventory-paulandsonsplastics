-- Migration: Hardening Sales Order Inner Component Flow
-- Date: 2026-04-06

-- 1. Add columns and fix nullability in sales_order_items
ALTER TABLE public.sales_order_items 
ALTER COLUMN product_id DROP NOT NULL,
ADD COLUMN IF NOT EXISTS include_inner BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS inner_id UUID REFERENCES public.inners(id),
ADD COLUMN IF NOT EXISTS quantity_reserved INTEGER DEFAULT 0;

-- 2. Add inner_id to stock_balances and fix unique constraint/index
ALTER TABLE public.stock_balances 
ADD COLUMN IF NOT EXISTS inner_id UUID REFERENCES public.inners(id);

ALTER TABLE public.stock_balances DROP CONSTRAINT IF EXISTS stock_balances_identity_unique;
DROP INDEX IF EXISTS public.stock_balances_identity_unique;
CREATE UNIQUE INDEX stock_balances_identity_unique ON public.stock_balances 
USING btree (product_id, factory_id, state, unit_type, cap_id, inner_id) NULLS NOT DISTINCT;

-- 3. Update adjust_stock RPC to handle inner_id
CREATE OR REPLACE FUNCTION public.adjust_stock(
    p_product_id UUID, 
    p_factory_id UUID, 
    p_state inventory_state, 
    p_quantity_change NUMERIC, 
    p_cap_id UUID DEFAULT NULL, 
    p_unit_type TEXT DEFAULT '',
    p_inner_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.stock_balances (product_id, factory_id, state, quantity, cap_id, unit_type, inner_id)
    VALUES (p_product_id, p_factory_id, p_state, p_quantity_change, p_cap_id, COALESCE(p_unit_type, ''), p_inner_id)
    ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id)
    DO UPDATE SET 
        quantity = stock_balances.quantity + EXCLUDED.quantity,
        last_updated = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update adjust_cap_stock RPC to support state and unit_type (needed for tests)
CREATE OR REPLACE FUNCTION public.adjust_cap_stock(
    p_cap_id UUID, 
    p_factory_id UUID, 
    p_quantity_change NUMERIC,
    p_state VARCHAR DEFAULT 'finished',
    p_unit_type VARCHAR DEFAULT 'loose'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type, last_updated)
    VALUES (p_cap_id, p_factory_id, p_quantity_change, COALESCE(p_state, 'finished'), COALESCE(p_unit_type, 'loose'), now())
    ON CONFLICT (cap_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = public.cap_stock_balances.quantity + EXCLUDED.quantity,
        last_updated = now();
END;
$$ LANGUAGE plpgsql SET search_path TO 'public';

-- 5. Fix unique index/constraint for cap_stock_balances
ALTER TABLE public.cap_stock_balances DROP CONSTRAINT IF EXISTS cap_stock_balances_unique_composite;
DROP INDEX IF EXISTS public.cap_stock_balances_unique_composite;
CREATE UNIQUE INDEX cap_stock_balances_unique_composite ON public.cap_stock_balances 
USING btree (cap_id, factory_id, state, unit_type) NULLS NOT DISTINCT;
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_customer_id UUID,
    p_delivery_date TEXT,
    p_notes TEXT,
    p_user_id UUID,
    p_items JSONB,
    p_order_date TEXT
) RETURNS JSONB AS $$
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
BEGIN
    -- 1. Pre-calculate total amount and validate pricing
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

    -- 2. Validate Credit Limit
    SELECT credit_limit INTO v_customer_limit 
    FROM public.customers WHERE id = p_customer_id;

    -- Calculate current outstanding balance
    SELECT COALESCE(SUM(balance_due), 0) INTO v_customer_balance
    FROM public.sales_orders WHERE customer_id = p_customer_id;

    IF v_customer_limit IS NOT NULL AND (v_customer_balance + v_total_amount) > v_customer_limit THEN
        RAISE EXCEPTION 'Order blocked: Total balance with this order (%) would exceed credit limit (%)', 
            (v_customer_balance + v_total_amount), v_customer_limit;
    END IF;

    -- 3. Create Sales Order
    INSERT INTO public.sales_orders (
        customer_id, delivery_date, status, notes, created_by, order_date,
        total_amount, balance_due, amount_paid
    ) VALUES (
        p_customer_id, 
        CASE WHEN p_delivery_date IS NULL OR p_delivery_date = '' THEN NULL ELSE p_delivery_date::DATE END, 
        'pending', p_notes, p_user_id, p_order_date::DATE,
        v_total_amount, v_total_amount, 0
    ) RETURNING id INTO v_order_id;

    -- 4. Process Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID, cap_id UUID, quantity INTEGER, unit_price NUMERIC, unit_type TEXT, include_inner BOOLEAN
    ) LOOP
        IF v_item.product_id IS NOT NULL THEN
            -- Fetch product details including template and default inner
            SELECT p.selling_price, p.factory_id, p.color, pt.inner_template_id
            INTO v_resource_data
            FROM public.products p
            LEFT JOIN public.product_templates pt ON p.template_id = pt.id
            WHERE p.id = v_item.product_id;

            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);
            
            -- Determine target inner if requested
            v_target_inner_id := NULL;
            IF v_item.include_inner = TRUE AND v_resource_data.inner_template_id IS NOT NULL THEN
                SELECT id INTO v_target_inner_id
                FROM public.inners
                WHERE template_id = v_resource_data.inner_template_id
                  AND color = v_resource_data.color
                LIMIT 1;
            END IF;

            -- Stock availability check (must factor in the inner requirement)
            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.stock_balances 
            WHERE product_id = v_item.product_id 
              AND unit_type = COALESCE(v_item.unit_type, 'bundle')
              AND state IN ('semi_finished', 'packed', 'finished')
              AND (factory_id = v_factory_id OR factory_id IS NULL)
              AND (
                  (v_item.include_inner = TRUE AND (inner_id = v_target_inner_id OR (v_target_inner_id IS NULL AND inner_id IS NULL))) OR
                  (COALESCE(v_item.include_inner, FALSE) = FALSE AND inner_id IS NULL)
              );

            v_is_backordered := v_available_stock < v_item.quantity;

            INSERT INTO public.sales_order_items (
                order_id, product_id, quantity, quantity_prepared, quantity_reserved, 
                unit_type, unit_price, is_backordered, is_prepared,
                include_inner, inner_id
            ) VALUES (
                v_order_id, v_item.product_id, v_item.quantity, 0, 0, 
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
              AND state IN ('finished')
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
$$ LANGUAGE plpgsql;
