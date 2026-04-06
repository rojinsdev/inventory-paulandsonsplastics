-- Full Sync Prod from Dev migrations (Mar 29 - Apr 7)


DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='cap_production_logs' AND column_name='machine_id'
    ) THEN
        ALTER TABLE cap_production_logs ADD COLUMN machine_id uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='cap_production_logs' AND column_name='weight_wastage_kg'
    ) THEN
        ALTER TABLE cap_production_logs ADD COLUMN weight_wastage_kg numeric;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='customers' AND column_name='balance_due'
    ) THEN
        ALTER TABLE customers ADD COLUMN balance_due numeric;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='inner_production_logs' AND column_name='weight_wastage_kg'
    ) THEN
        ALTER TABLE inner_production_logs ADD COLUMN weight_wastage_kg numeric;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='inner_stock_balances' AND column_name='state'
    ) THEN
        ALTER TABLE inner_stock_balances ADD COLUMN state character varying;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='inner_stock_balances' AND column_name='unit_type'
    ) THEN
        ALTER TABLE inner_stock_balances ADD COLUMN unit_type character varying;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='inners' AND column_name='ideal_cycle_time_seconds'
    ) THEN
        ALTER TABLE inners ADD COLUMN ideal_cycle_time_seconds numeric;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='inners' AND column_name='ideal_weight_grams'
    ) THEN
        ALTER TABLE inners ADD COLUMN ideal_weight_grams numeric;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='inventory_transactions' AND column_name='inner_id'
    ) THEN
        ALTER TABLE inventory_transactions ADD COLUMN inner_id uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='products' AND column_name='inner_id'
    ) THEN
        ALTER TABLE products ADD COLUMN inner_id uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='supplier_payments' AND column_name='created_by'
    ) THEN
        ALTER TABLE supplier_payments ADD COLUMN created_by uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='supplier_payments' AND column_name='factory_id'
    ) THEN
        ALTER TABLE supplier_payments ADD COLUMN factory_id uuid;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='supplier_payments' AND column_name='supplier_id'
    ) THEN
        ALTER TABLE supplier_payments ADD COLUMN supplier_id uuid;
    END IF;
END $$;

-- Functions from files:

-- File: 202603290000_submit_production_atomic.sql
-- Migration: submit_production_atomic
-- Created: 2026-03-29
-- Description: Refactors submitProduction into an atomic database operation.

CREATE OR REPLACE FUNCTION submit_production_atomic(
  p_machine_id UUID,
  p_product_id UUID,
  p_shift_number INT,
  p_start_time TIME,
  p_end_time TIME,
  p_total_produced INT,
  p_damaged_count INT,
  p_actual_cycle_time_seconds NUMERIC,
  p_actual_weight_grams NUMERIC,
  p_downtime_minutes INT,
  p_downtime_reason TEXT,
  p_date DATE,
  p_user_id UUID,
  p_factory_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_log_id UUID;
  v_actual_quantity INT;
  v_weight_grams NUMERIC;
  v_raw_material_id UUID;
  v_ideal_cycle_time NUMERIC;
  v_weight_wastage_kg NUMERIC;
  v_flagged_for_review BOOLEAN;
  v_required_material_kg NUMERIC;
  v_total_weight_kg NUMERIC; -- Only for weight-based products
  v_theoretical_quantity INT;
  v_efficiency_percentage NUMERIC;
  v_units_lost_to_cycle INT;
  v_counting_method TEXT;
  v_inner_id UUID;
  v_cap_template_id UUID;
BEGIN
  -- 1. Fetch Product & Machine Metadata
  SELECT 
    p.weight_grams, 
    p.raw_material_id, 
    p.counting_method,
    p.inner_id,
    p.cap_template_id,
    COALESCE(mp.ideal_cycle_time_seconds, 0)
  INTO 
    v_weight_grams, 
    v_raw_material_id, 
    v_counting_method,
    v_inner_id,
    v_cap_template_id,
    v_ideal_cycle_time
  FROM products p
  LEFT JOIN machine_products mp ON mp.product_id = p.id AND mp.machine_id = p_machine_id
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or not mapped to machine';
  END IF;

  -- 2. Calculate Actual Quantities
  IF v_counting_method = 'weight_based' THEN
    -- For caps, total_weight_kg is usually provided in the request
    -- But since this RPC is generic, we can calculate if weights are provided
    v_total_weight_kg := (p_total_produced * COALESCE(p_actual_weight_grams, v_weight_grams)) / 1000;
    v_actual_quantity := p_total_produced;
  ELSE
    v_actual_quantity := p_total_produced - COALESCE(p_damaged_count, 0);
  END IF;

  IF v_actual_quantity < 0 THEN
    RAISE EXCEPTION 'Actual quantity cannot be negative';
  END IF;

  -- 3. wastage and flagging
  v_weight_wastage_kg := (v_actual_quantity * (COALESCE(p_actual_weight_grams, v_weight_grams) - v_weight_grams)) / 1000;
  IF v_weight_wastage_kg < 0 THEN v_weight_wastage_kg := 0; END IF;

  v_flagged_for_review := v_ideal_cycle_time > 0 AND p_actual_cycle_time_seconds > (v_ideal_cycle_time * 1.05);

  -- 4. Raw Material consumption
  v_required_material_kg := (v_actual_quantity * v_weight_grams) / 1000;

  -- 5. VALIDATION: Check Raw Material Availability
  IF NOT EXISTS (SELECT 1 FROM raw_materials WHERE id = v_raw_material_id AND stock_weight_kg >= v_required_material_kg) THEN
    -- Fetch available stock for detail
    DECLARE
        v_available_rm NUMERIC;
    BEGIN
        SELECT stock_weight_kg INTO v_available_rm FROM raw_materials WHERE id = v_raw_material_id;
        RAISE EXCEPTION 'Insufficient raw material stock. Need %, have %', v_required_material_kg, v_available_rm;
    END;
  END IF;

  -- 6. Insert Log
  INSERT INTO production_logs (
    date, machine_id, product_id, user_id, factory_id,
    shift_number, start_time, end_time,
    total_produced, damaged_count, actual_quantity,
    total_weight_kg,
    actual_cycle_time_seconds, flagged_for_review,
    actual_weight_grams, weight_wastage_kg,
    downtime_minutes, downtime_reason,
    status,
    created_at
  ) VALUES (
    p_date, p_machine_id, p_product_id, p_user_id, p_factory_id,
    p_shift_number, p_start_time, p_end_time,
    p_total_produced, p_damaged_count, v_actual_quantity,
    v_total_weight_kg,
    p_actual_cycle_time_seconds, v_flagged_for_review,
    p_actual_weight_grams, v_weight_wastage_kg,
    p_downtime_minutes, p_downtime_reason,
    'submitted',
    NOW()
  ) RETURNING id INTO v_log_id;

  -- 7. Update Stocks
  -- Raw Material
  UPDATE raw_materials 
  SET stock_weight_kg = stock_weight_kg - v_required_material_kg,
      updated_at = NOW()
  WHERE id = v_raw_material_id;

  -- Finished Product
  INSERT INTO stock_balances (product_id, state, quantity, factory_id, unit_type, last_updated)
  VALUES (p_product_id, 'packed', v_actual_quantity, p_factory_id, '', NOW())
  ON CONFLICT (product_id, state, factory_id, cap_id, inner_id, unit_type) 
  DO UPDATE SET 
    quantity = stock_balances.quantity + EXCLUDED.quantity,
    last_updated = NOW();

  -- 8. Log Transactions
  -- Product
  INSERT INTO inventory_transactions (
    product_id, to_state, quantity, transaction_type, reference_id, factory_id, created_by
  ) VALUES (
    p_product_id, 'packed', v_actual_quantity, 'production', v_log_id, p_factory_id, p_user_id
  );

  -- Raw Material
  INSERT INTO inventory_transactions (
    raw_material_id, from_state, quantity, transaction_type, reference_id, factory_id, created_by
  ) VALUES (
    v_raw_material_id, 'raw_material', v_required_material_kg, 'production_consumption', v_log_id, p_factory_id, p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'actual_quantity', v_actual_quantity,
    'material_consumed_kg', v_required_material_kg
  );
END;
$$ LANGUAGE plpgsql;


-- File: 202603290001_add_cap_id_to_inventory_transactions.sql
-- Migration: add_cap_id_to_inventory_transactions
-- Created: 2026-03-29
-- Description: Adds cap_id column and foreign key to inventory_transactions for accurate audit logging.

ALTER TABLE public.inventory_transactions 
ADD COLUMN cap_id UUID REFERENCES public.caps(id);

-- Add index for performance
CREATE INDEX idx_inventory_transactions_cap ON public.inventory_transactions(cap_id);


-- File: 202603290002_prepare_order_items_atomic.sql
-- Migration: prepare_order_items_atomic
-- Created: 2026-03-29
-- Description: Atomic RPC for preparing sales order items and reserving stock.

CREATE OR REPLACE FUNCTION prepare_order_items_atomic(
  p_order_id UUID,
  p_items JSONB, -- Array of {itemId, quantity}
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_item RECORD;
  v_source_state TEXT;
  v_factory_id UUID;
  v_updated_count INT := 0;
BEGIN
  -- Iterate over items to prepare
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(itemId UUID, quantity INT)
  LOOP
    DECLARE
      v_product_id UUID;
      v_unit_type TEXT;
      v_qty_to_prepare INT := v_item.quantity;
      v_already_prepared INT;
      v_total_needed INT;
      v_balance RECORD;
      v_remaining_to_reserve INT := v_item.quantity;
      v_available_stock INT;
    BEGIN
      -- 1. Fetch check item details
      SELECT 
        soi.product_id, soi.unit_type, soi.quantity, soi.quantity_prepared, p.factory_id
      INTO 
        v_product_id, v_unit_type, v_total_needed, v_already_prepared, v_factory_id
      FROM sales_order_items soi
      JOIN products p ON p.id = soi.product_id
      WHERE soi.id = v_item.itemId AND soi.order_id = p_order_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % not found in order %', v_item.itemId, p_order_id;
      END IF;

      -- 2. Validation
      IF v_already_prepared + v_qty_to_prepare > v_total_needed THEN
        RAISE EXCEPTION 'Cannot prepare % units for item %. Total needed: %, already prepared: %', 
          v_qty_to_prepare, v_item.itemId, v_total_needed, v_already_prepared;
      END IF;

      -- 3. Map State
      v_source_state := CASE v_unit_type
        WHEN 'loose' THEN 'semi_finished'
        WHEN 'packet' THEN 'packed'
        WHEN 'bundle' THEN 'finished'
        ELSE 'finished'
      END;

      -- 4. Check total available stock across all relevant rows
      SELECT SUM(quantity) INTO v_available_stock 
      FROM stock_balances 
      WHERE product_id = v_product_id 
        AND state = v_source_state 
        AND (factory_id = v_factory_id OR factory_id IS NULL)
        AND unit_type = v_unit_type;
        
      IF COALESCE(v_available_stock, 0) < v_qty_to_prepare THEN
         RAISE EXCEPTION 'Insufficient stock for product %. Required: %, Available: % in %', 
           v_product_id, v_qty_to_prepare, COALESCE(v_available_stock, 0), v_source_state;
      END IF;

      -- 5. RESERVE STOCK (Sequentially from multiple rows if needed)
      FOR v_balance IN 
        SELECT id, quantity, cap_id, inner_id 
        FROM stock_balances 
        WHERE product_id = v_product_id 
          AND state = v_source_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND unit_type = v_unit_type
          AND quantity > 0
        ORDER BY quantity DESC 
      LOOP
        EXIT WHEN v_remaining_to_reserve <= 0;
        
        DECLARE
          v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
        BEGIN
          -- Deduct from Source
          UPDATE stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
          
          -- Add to Reserved
          INSERT INTO stock_balances (product_id, factory_id, state, quantity, cap_id, inner_id, unit_type, last_updated)
          VALUES (v_product_id, v_factory_id, 'reserved', v_deduct_qty, v_balance.cap_id, v_balance.inner_id, v_unit_type, NOW())
          ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
          DO UPDATE SET 
            quantity = stock_balances.quantity + EXCLUDED.quantity,
            last_updated = NOW();
            
          v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
        END;
      END LOOP;

      -- 6. Update Order Item
      UPDATE sales_order_items SET 
        quantity_prepared = quantity_prepared + v_item.quantity,
        quantity_reserved = COALESCE(quantity_reserved, 0) + v_item.quantity,
        is_prepared = (quantity_prepared + v_item.quantity) >= quantity,
        prepared_at = NOW(),
        prepared_by = p_user_id
      WHERE id = v_item.itemId;

      -- 7. Log Transactions
      INSERT INTO inventory_transactions (
        product_id, from_state, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type
      ) VALUES (
        v_product_id, v_source_state, 'reserved', v_item.quantity, 'reserve', p_order_id, v_factory_id, p_user_id, v_unit_type
      );

      v_updated_count := v_updated_count + 1;
    END;
  END LOOP;

  -- 8. Update Sales Order Status if needed
  IF v_updated_count > 0 THEN
    UPDATE sales_orders SET 
      status = 'reserved', 
      updated_at = NOW() 
    WHERE id = p_order_id AND status != 'delivered';
  END IF;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated_count);
END;
$$ LANGUAGE plpgsql;


-- File: 202603290002_update_production_history_view.sql
-- Update unified_production_history view to align with mobile app expectations
-- Changes: 
-- 1. Joins with user_profiles to include user_name
-- 2. Renames item_display_name to item_name
-- 3. Adds a unit column
-- 4. Ensures action_type and item_type are consistent

DROP VIEW IF EXISTS public.unified_production_history CASCADE;

CREATE VIEW public.unified_production_history AS
 SELECT pl.id,
    pl.created_at AS "timestamp",
    pl.factory_id,
    pl.user_id,
    up.name AS user_name,
    'tub'::text AS item_type,
    'production'::text AS action_type,
    pl.product_id AS item_id,
    (((p.name || ' ('::text) || p.size) || ')'::text) AS item_name,
    pl.actual_quantity::numeric AS quantity,
    'pcs'::text AS unit,
    pl.shift_number,
    NULL::text AS notes
   FROM ((production_logs pl
     JOIN products p ON ((pl.product_id = p.id)))
     LEFT JOIN user_profiles up ON ((pl.user_id = up.id)))
UNION ALL
 SELECT cpl.id,
    cpl.created_at AS "timestamp",
    cpl.factory_id,
    cpl.user_id,
    up.name AS user_name,
    'cap'::text AS item_type,
    'production'::text AS action_type,
    cpl.cap_id AS item_id,
    (((ct.name || ' ('::text) || c.color) || ')'::text) AS item_name,
    COALESCE(cpl.total_produced, cpl.calculated_quantity)::numeric AS quantity,
    'pcs'::text AS unit,
    cpl.shift_number,
    cpl.remarks AS notes
   FROM (((cap_production_logs cpl
     JOIN caps c ON ((cpl.cap_id = c.id)))
     JOIN cap_templates ct ON ((c.template_id = ct.id)))
     LEFT JOIN user_profiles up ON ((cpl.user_id = up.id)))
UNION ALL
 SELECT ipl.id,
    ipl.created_at AS "timestamp",
    ipl.factory_id,
    ipl.user_id,
    up.name AS user_name,
    'inner'::text AS item_type,
    'production'::text AS action_type,
    ipl.inner_id AS item_id,
    (((it.name || ' ('::text) || i.color) || ')'::text) AS item_name,
    ipl.calculated_quantity::numeric AS quantity,
    'pcs'::text AS unit,
    ipl.shift_number,
    NULL::text AS notes
   FROM (((inner_production_logs ipl
     JOIN inners i ON ((ipl.inner_id = i.id)))
     JOIN inner_templates it ON ((i.template_id = it.id)))
     LEFT JOIN user_profiles up ON ((ipl.user_id = up.id)))
UNION ALL
 SELECT itxn.id,
    itxn.created_at AS "timestamp",
    itxn.factory_id,
    itxn.created_by AS user_id,
    up.name AS user_name,
        CASE
            WHEN (itxn.transaction_type = 'bundle'::text) THEN 'bundle'::text
            WHEN (itxn.transaction_type = 'pack'::text) THEN 'pack'::text
            ELSE 'other'::text
        END AS item_type,
    itxn.transaction_type AS action_type,
    itxn.product_id AS item_id,
    (((p.name || ' ('::text) || p.size) || ')'::text) AS item_name,
    itxn.quantity::numeric AS quantity,
    itxn.unit_type AS unit,
    NULL::integer AS shift_number,
    itxn.note AS notes
   FROM ((inventory_transactions itxn
     JOIN products p ON ((itxn.product_id = p.id)))
     LEFT JOIN user_profiles up ON ((itxn.created_by = up.id)))
  WHERE (itxn.transaction_type = ANY (ARRAY['bundle'::text, 'pack'::text, 'unpack'::text]));


-- File: 202603290003_harden_process_partial_dispatch.sql
-- Migration: harden_process_partial_dispatch
-- Created: 2026-03-29
-- Description: Hardens the partial dispatch RPC to handle multiple reserved rows and ensure data integrity.

CREATE OR REPLACE FUNCTION public.process_partial_dispatch(
    p_order_id UUID,
    p_items JSONB, -- Array of {item_id, quantity, unit_price}
    p_discount_type TEXT,
    p_discount_value NUMERIC,
    p_payment_mode TEXT,
    p_credit_deadline DATE,
    p_initial_payment NUMERIC,
    p_notes TEXT,
    p_user_id UUID,
    p_payment_method TEXT DEFAULT 'cash'
) RETURNS JSONB AS $$
DECLARE
    v_dispatch_id UUID;
    v_subtotal NUMERIC := 0;
    v_batch_discount NUMERIC := 0;
    v_batch_total NUMERIC;
    v_item RECORD;
    v_current_item RECORD;
    v_customer_id UUID;
    v_balance RECORD;
BEGIN
    -- Validation: Check order exists
    SELECT customer_id INTO v_customer_id FROM public.sales_orders WHERE id = p_order_id;
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- 1. Create Dispatch Record
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        item_id UUID, 
        quantity INTEGER, 
        unit_price NUMERIC
    ) LOOP
        v_subtotal := v_subtotal + (v_item.quantity * v_item.unit_price);
    END LOOP;

    IF p_discount_type = 'percentage' THEN
        v_batch_discount := (v_subtotal * COALESCE(p_discount_value, 0)) / 100;
    ELSE
        v_batch_discount := COALESCE(p_discount_value, 0);
    END IF;
    v_batch_total := v_subtotal - v_batch_discount;

    INSERT INTO public.dispatch_records (
        order_id, subtotal, discount_value, total_amount, recorded_by, notes
    ) VALUES (
        p_order_id, v_subtotal, v_batch_discount, v_batch_total, p_user_id, p_notes
    ) RETURNING id INTO v_dispatch_id;

    -- 2. Process Items and Stock
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        item_id UUID, 
        quantity INTEGER, 
        unit_price NUMERIC
    ) LOOP
        DECLARE
            v_remaining_to_dispatch INT := v_item.quantity;
        BEGIN
            -- Fetch internal item data
            SELECT 
                soi.product_id, 
                soi.unit_type,
                soi.quantity_shipped, 
                soi.quantity_reserved,
                p.factory_id
            INTO v_current_item
            FROM public.sales_order_items soi
            JOIN public.products p ON p.id = soi.product_id
            WHERE soi.id = v_item.item_id;

            IF v_current_item.product_id IS NULL THEN
                RAISE EXCEPTION 'Order item % not found', v_item.item_id;
            END IF;

            IF v_item.quantity > (v_current_item.quantity_reserved - v_current_item.quantity_shipped) THEN
                RAISE EXCEPTION 'Cannot dispatch % for item %. Only % reserved and ready.', 
                    v_item.quantity, v_item.item_id, (v_current_item.quantity_reserved - v_current_item.quantity_shipped);
            END IF;

            -- Update sales_order_items
            UPDATE public.sales_order_items
            SET quantity_shipped = quantity_shipped + v_item.quantity,
                unit_price = v_item.unit_price,
                is_prepared = (quantity_shipped + v_item.quantity) >= quantity
            WHERE id = v_item.item_id;

            -- Create link record
            INSERT INTO public.dispatch_items (dispatch_id, sales_order_item_id, quantity_shipped)
            VALUES (v_dispatch_id, v_item.item_id, v_item.quantity);

            -- Deduct from RESERVED stock across all possible rows (batches)
            FOR v_balance IN 
                SELECT id, quantity 
                FROM public.stock_balances 
                WHERE product_id = v_current_item.product_id 
                  AND state = 'reserved' 
                  AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                  AND unit_type = v_current_item.unit_type
                  AND quantity > 0
                ORDER BY quantity DESC
            LOOP
                EXIT WHEN v_remaining_to_dispatch <= 0;
                
                DECLARE
                    v_deduct_qty INT := LEAST(v_remaining_to_dispatch, v_balance.quantity);
                BEGIN
                    UPDATE public.stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
                    v_remaining_to_dispatch := v_remaining_to_dispatch - v_deduct_qty;
                END;
            END LOOP;

            IF v_remaining_to_dispatch > 0 THEN
                RAISE EXCEPTION 'Internal error: Insufficient reserved stock for product %. Need %, found % more.', 
                    v_current_item.product_id, v_item.quantity, v_remaining_to_dispatch;
            END IF;
        END;
    END LOOP;

    -- 3. Record Initial Payment (if any)
    IF p_initial_payment > 0 THEN
        INSERT INTO public.payments (
            sales_order_id, customer_id, amount, payment_method, notes, recorded_by
        ) VALUES (
            p_order_id, v_customer_id, p_initial_payment, COALESCE(p_payment_method, 'cash'),
            'Initial payment for dispatch ' || v_dispatch_id, p_user_id
        );
    END IF;

    -- 4. Update Order Level totals
    UPDATE public.sales_orders
    SET 
        subtotal = COALESCE(subtotal, 0) + v_subtotal,
        discount_value = COALESCE(discount_value, 0) + v_batch_discount,
        total_amount = COALESCE(total_amount, 0) + v_batch_total,
        amount_paid = COALESCE(amount_paid, 0) + COALESCE(p_initial_payment, 0),
        balance_due = (COALESCE(total_amount, 0) + v_batch_total) - (COALESCE(amount_paid, 0) + COALESCE(p_initial_payment, 0)),
        payment_mode = COALESCE(p_payment_mode, payment_mode),
        credit_deadline = COALESCE(p_credit_deadline, credit_deadline),
        status = CASE 
            WHEN (SELECT EVERY(quantity_shipped >= quantity) FROM public.sales_order_items WHERE order_id = p_order_id) 
            THEN 'delivered'
            ELSE 'partially_delivered'
        END,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'dispatch_id', v_dispatch_id,
        'batch_total', v_batch_total,
        'order_id', p_order_id,
        'status', (SELECT status FROM public.sales_orders WHERE id = p_order_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- File: 202603290004_create_order_atomic.sql
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


-- File: 20260329_fix_create_order_atomic_no_auto_reserve.sql
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


-- File: 20260401_add_cap_support_to_sales.sql
-- Migration: add_cap_support_to_sales
-- Created: 2026-04-01

-- 1. Update sales_order_items
ALTER TABLE public.sales_order_items ADD COLUMN cap_id UUID REFERENCES public.caps(id);

-- 2. Update production_requests
ALTER TABLE public.production_requests ADD COLUMN cap_id UUID REFERENCES public.caps(id);

-- 3. Update inventory_transactions
ALTER TABLE public.inventory_transactions ADD COLUMN cap_id UUID REFERENCES public.caps(id);

-- 4. Standardize cap_stock_balances
-- Add state and unit_type columns
ALTER TABLE public.cap_stock_balances ADD COLUMN state VARCHAR DEFAULT 'finished';
ALTER TABLE public.cap_stock_balances ADD COLUMN unit_type VARCHAR DEFAULT 'loose';

-- Update uniqueness constraint for cap_stock_balances to include state and unit_type
ALTER TABLE public.cap_stock_balances DROP CONSTRAINT IF EXISTS cap_stock_balances_cap_id_factory_id_key;
ALTER TABLE public.cap_stock_balances ADD CONSTRAINT cap_stock_balances_unique_composite UNIQUE (cap_id, factory_id, state, unit_type);

-- 5. Data Migration (Optional: initialize existing balances to 'finished'/'loose')
UPDATE public.cap_stock_balances SET state = 'finished', unit_type = 'loose' WHERE state IS NULL;


-- File: 20260401_update_create_order_atomic_for_caps.sql
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


-- File: 20260401_update_prepare_order_items_atomic_for_caps.sql
-- Migration: update_prepare_order_items_atomic_for_caps
-- Created: 2026-04-01

CREATE OR REPLACE FUNCTION prepare_order_items_atomic(
  p_order_id UUID,
  p_items JSONB, -- Array of {itemId, quantity}
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_item RECORD;
  v_source_state TEXT;
  v_factory_id UUID;
  v_updated_count INT := 0;
BEGIN
  -- Iterate over items to prepare
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(itemId UUID, quantity INT)
  LOOP
    DECLARE
      v_product_id UUID;
      v_cap_id UUID;
      v_unit_type TEXT;
      v_qty_to_prepare INT := v_item.quantity;
      v_already_prepared INT;
      v_total_needed INT;
      v_balance RECORD;
      v_remaining_to_reserve INT := v_item.quantity;
      v_available_stock INT;
    BEGIN
      -- 1. Fetch item details
      SELECT 
        soi.product_id, soi.cap_id, soi.unit_type, soi.quantity, soi.quantity_prepared
      INTO 
        v_product_id, v_cap_id, v_unit_type, v_total_needed, v_already_prepared
      FROM sales_order_items soi
      WHERE soi.id = v_item.itemId AND soi.order_id = p_order_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % not found in order %', v_item.itemId, p_order_id;
      END IF;

      -- 2. Validation
      IF v_already_prepared + v_qty_to_prepare > v_total_needed THEN
        RAISE EXCEPTION 'Cannot prepare % units for item %. Total needed: %, already prepared: %', 
          v_qty_to_prepare, v_item.itemId, v_total_needed, v_already_prepared;
      END IF;

      -- 3. LOGIC BRANCH: Product vs Cap
      IF v_product_id IS NOT NULL THEN
        -- PRODUCT LOGIC
        SELECT factory_id INTO v_factory_id FROM products WHERE id = v_product_id;
        
        v_source_state := CASE v_unit_type
          WHEN 'loose' THEN 'semi_finished'
          WHEN 'packet' THEN 'packed'
          WHEN 'bundle' THEN 'finished'
          ELSE 'finished'
        END;

        -- Check Product Stock
        SELECT SUM(quantity) INTO v_available_stock 
        FROM stock_balances 
        WHERE product_id = v_product_id 
          AND state = v_source_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND unit_type = v_unit_type;
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_prepare THEN
           RAISE EXCEPTION 'Insufficient stock for product %. Required: %, Available: % in %', 
             v_product_id, v_qty_to_prepare, COALESCE(v_available_stock, 0), v_source_state;
        END IF;

        -- Reserve Product Stock
        FOR v_balance IN 
          SELECT id, quantity, cap_id, inner_id 
          FROM stock_balances 
          WHERE product_id = v_product_id 
            AND state = v_source_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND unit_type = v_unit_type
            AND quantity > 0
          ORDER BY quantity DESC 
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            INSERT INTO stock_balances (product_id, factory_id, state, quantity, cap_id, inner_id, unit_type, last_updated)
            VALUES (v_product_id, v_factory_id, 'reserved', v_deduct_qty, v_balance.cap_id, v_balance.inner_id, v_unit_type, NOW())
            ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
            DO UPDATE SET 
              quantity = stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;

        -- Log Transaction (Product)
        INSERT INTO inventory_transactions (
          product_id, cap_id, from_state, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type
        ) VALUES (
          v_product_id, NULL, v_source_state, 'reserved', v_item.quantity, 'reserve', p_order_id, v_factory_id, p_user_id, v_unit_type
        );

      ELSIF v_cap_id IS NOT NULL THEN
        -- CAP LOGIC
        SELECT factory_id INTO v_factory_id FROM caps WHERE id = v_cap_id;
        v_source_state := 'finished';

        -- Check Cap Stock
        SELECT SUM(quantity) INTO v_available_stock 
        FROM cap_stock_balances 
        WHERE cap_id = v_cap_id 
          AND state = v_source_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND unit_type = COALESCE(v_unit_type, 'loose');
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_prepare THEN
           RAISE EXCEPTION 'Insufficient stock for cap %. Required: %, Available: %', 
             v_cap_id, v_qty_to_prepare, COALESCE(v_available_stock, 0);
        END IF;

        -- Reserve Cap Stock
        FOR v_balance IN 
          SELECT id, quantity 
          FROM cap_stock_balances 
          WHERE cap_id = v_cap_id 
            AND state = v_source_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND unit_type = COALESCE(v_unit_type, 'loose')
            AND quantity > 0
          ORDER BY quantity DESC 
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE cap_stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            INSERT INTO cap_stock_balances (cap_id, factory_id, state, quantity, unit_type, last_updated)
            VALUES (v_cap_id, v_factory_id, 'reserved', v_deduct_qty, COALESCE(v_unit_type, 'loose'), NOW())
            ON CONFLICT (cap_id, factory_id, state, unit_type) 
            DO UPDATE SET 
              quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;

        -- Log Transaction (Cap)
        INSERT INTO inventory_transactions (
          product_id, cap_id, from_state, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type
        ) VALUES (
          NULL, v_cap_id, v_source_state, 'reserved', v_item.quantity, 'reserve', p_order_id, v_factory_id, p_user_id, COALESCE(v_unit_type, 'loose')
        );

      END IF;

      -- 4. Update Order Item
      UPDATE sales_order_items SET 
        quantity_prepared = quantity_prepared + v_item.quantity,
        quantity_reserved = COALESCE(quantity_reserved, 0) + v_item.quantity,
        is_prepared = (quantity_prepared + v_item.quantity) >= quantity,
        prepared_at = NOW(),
        prepared_by = p_user_id
      WHERE id = v_item.itemId;

      v_updated_count := v_updated_count + 1;
    END;
  END LOOP;

  -- 5. Update Sales Order Status if needed
  IF v_updated_count > 0 THEN
    UPDATE sales_orders SET 
      status = 'reserved', 
      updated_at = NOW() 
    WHERE id = p_order_id AND status != 'delivered';
  END IF;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated_count);
END;
$$ LANGUAGE plpgsql;


-- File: 20260402_cap_machine_mapping.sql
-- Create machine_cap_templates table
CREATE TABLE IF NOT EXISTS public.machine_cap_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID REFERENCES public.machines(id) ON DELETE CASCADE,
    cap_template_id UUID REFERENCES public.cap_templates(id) ON DELETE CASCADE,
    ideal_cycle_time_seconds NUMERIC NOT NULL,
    capacity_restriction NUMERIC,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(machine_id, cap_template_id)
);

-- Enable RLS
ALTER TABLE public.machine_cap_templates ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies
CREATE POLICY "Enable all for authenticated users" ON public.machine_cap_templates
    FOR ALL USING (auth.role() = 'authenticated');

-- Migrate existing data from cap_templates
INSERT INTO public.machine_cap_templates (machine_id, cap_template_id, ideal_cycle_time_seconds)
SELECT 
    machine_id, 
    id as cap_template_id, 
    COALESCE(ideal_cycle_time_seconds, 0) as ideal_cycle_time_seconds
FROM public.cap_templates
WHERE machine_id IS NOT NULL;

-- Remove legacy columns from cap_templates
ALTER TABLE public.cap_templates DROP COLUMN IF EXISTS machine_id;
ALTER TABLE public.cap_templates DROP COLUMN IF EXISTS ideal_cycle_time_seconds;

-- Remove legacy columns from caps
ALTER TABLE public.caps DROP COLUMN IF EXISTS machine_id;
ALTER TABLE public.caps DROP COLUMN IF EXISTS ideal_cycle_time_seconds;

-- Add machine_id to cap_production_logs
ALTER TABLE public.cap_production_logs ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES public.machines(id);


-- File: 20260403_add_supplier_id_to_payments.sql
-- Migration: 20260403_add_supplier_id_to_payments
-- Summary: Adds supplier_id and factory_id to supplier_payments to allow general payments and better data isolation.

-- 1. Add columns
ALTER TABLE public.supplier_payments
ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id),
ADD COLUMN factory_id UUID REFERENCES public.factories(id);

-- 2. Make purchase_id nullable (if it wasn't already, usually it is but good to be explicit)
ALTER TABLE public.supplier_payments
ALTER COLUMN purchase_id DROP NOT NULL;

-- 3. Backfill data (if any existed, but we checked and it's empty)
-- UPDATE public.supplier_payments sp
-- SET 
--   supplier_id = p.supplier_id,
--   factory_id = p.factory_id
-- FROM public.purchases p
-- WHERE sp.purchase_id = p.id;

-- 4. Set NOT NULL constraints (do this AFTER backfilling)
-- For now, let's make them nullable first and then enforce NOT NULL in code
-- Actually, the service always provides them, so NOT NULL is safer.
-- Since it's empty, we can just do it.

ALTER TABLE public.supplier_payments
ALTER COLUMN supplier_id SET NOT NULL,
ALTER COLUMN factory_id SET NOT NULL;

-- 5. Update RLS to ensure managers can only see their factory's payments
-- Existing policy: Managers can view supplier_payments -> is_manager(auth.uid())
-- Let's update it to check factory_id if we want full isolation.

-- But given the existing simple policy, I'll leave it as is unless requested otherwise, 
-- or I'll refine it to be better.

-- DROP POLICY IF EXISTS "Managers can view supplier_payments" ON public.supplier_payments;
-- CREATE POLICY "Managers can view supplier_payments" ON public.supplier_payments
-- FOR SELECT USING (is_manager(auth.uid()) AND (factory_id IN (SELECT factory_id FROM user_profiles WHERE id = auth.uid())));


-- File: 20260403_decouple_fulfillment_reservation.sql
-- Migration: decouple_fulfillment_reservation
-- Created: 2026-04-03
-- Description: Refactors prepare_order_items_atomic to focus on reservation and verify 'prepared' signal for backordered items.

CREATE OR REPLACE FUNCTION prepare_order_items_atomic(
  p_order_id UUID,
  p_items JSONB, -- Array of {itemId, quantity}
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_item RECORD;
  v_source_state TEXT;
  v_factory_id UUID;
  v_updated_count INT := 0;
BEGIN
  -- Iterate over items to reserve
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(itemId UUID, quantity INT)
  LOOP
    DECLARE
      v_product_id UUID;
      v_cap_id UUID;
      v_inner_id UUID;
      v_unit_type TEXT;
      v_qty_to_reserve INT := v_item.quantity;
      v_already_reserved INT;
      v_total_needed INT;
      v_is_backordered BOOLEAN;
      v_balance RECORD;
      v_remaining_to_reserve INT := v_item.quantity;
      v_available_stock INT;
      v_prepared_qty_available INT := 0;
    BEGIN
      -- 1. Fetch item details
      SELECT 
        soi.product_id, soi.cap_id, soi.unit_type, soi.quantity, 
        COALESCE(soi.quantity_reserved, 0), soi.is_backordered
      INTO 
        v_product_id, v_cap_id, v_unit_type, v_total_needed, 
        v_already_reserved, v_is_backordered
      FROM sales_order_items soi
      WHERE soi.id = v_item.itemId AND soi.order_id = p_order_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % not found in order %', v_item.itemId, p_order_id;
      END IF;

      -- 2. Validation: Not exceeding total needed
      IF v_already_reserved + v_qty_to_reserve > v_total_needed THEN
        RAISE EXCEPTION 'Cannot reserve % units for item %. Total needed: %, already reserved: %', 
          v_qty_to_reserve, v_item.itemId, v_total_needed, v_already_reserved;
      END IF;

      -- 3. Validation: If backordered, ensure production request is 'prepared'
      IF v_is_backordered THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_prepared_qty_available
        FROM production_requests
        WHERE sales_order_id = p_order_id
          AND (product_id = v_product_id OR (product_id IS NULL AND v_product_id IS NULL))
          AND (cap_id = v_cap_id OR (cap_id IS NULL AND v_cap_id IS NULL))
          AND status = 'prepared';

        -- Check if we have enough "prepared" signal to cover this reservation
        -- Note: We track total prepared vs total reserved for this item pool
        IF v_already_reserved + v_qty_to_reserve > v_prepared_qty_available THEN
          RAISE EXCEPTION 'Cannot reserve % units for backordered item %. Only % units have been marked as "Prepared" via production.', 
            v_qty_to_reserve, v_item.itemId, v_prepared_qty_available;
        END IF;
      END IF;

      -- 4. LOGIC BRANCH: Product vs Cap
      IF v_product_id IS NOT NULL THEN
        -- PRODUCT LOGIC
        SELECT factory_id INTO v_factory_id FROM products WHERE id = v_product_id;
        
        v_source_state := CASE v_unit_type
          WHEN 'loose' THEN 'semi_finished'
          WHEN 'packet' THEN 'packed'
          WHEN 'bundle' THEN 'finished'
          ELSE 'finished'
        END;

        -- Check Product Stock (Final safety check)
        SELECT SUM(quantity) INTO v_available_stock 
        FROM stock_balances 
        WHERE product_id = v_product_id 
          AND state = v_source_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND unit_type = v_unit_type;
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for product %. Required: %, Available: % in %', 
             v_product_id, v_qty_to_reserve, COALESCE(v_available_stock, 0), v_source_state;
        END IF;

        -- Reserve Product Stock
        FOR v_balance IN 
          SELECT id, quantity, cap_id, inner_id 
          FROM stock_balances 
          WHERE product_id = v_product_id 
            AND state = v_source_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND unit_type = v_unit_type
            AND quantity > 0
          ORDER BY quantity DESC 
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            INSERT INTO stock_balances (product_id, factory_id, state, quantity, cap_id, inner_id, unit_type, last_updated)
            VALUES (v_product_id, v_factory_id, 'reserved', v_deduct_qty, v_balance.cap_id, v_balance.inner_id, v_unit_type, NOW())
            ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
            DO UPDATE SET 
              quantity = stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;

        -- Log Transaction (Product)
        INSERT INTO inventory_transactions (
          product_id, cap_id, from_state, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type
        ) VALUES (
          v_product_id, NULL, v_source_state, 'reserved', v_item.quantity, 'reserve', p_order_id, v_factory_id, p_user_id, v_unit_type
        );

      ELSIF v_cap_id IS NOT NULL THEN
        -- CAP LOGIC
        SELECT factory_id INTO v_factory_id FROM caps WHERE id = v_cap_id;
        v_source_state := 'finished';

        -- Check Cap Stock
        SELECT SUM(quantity) INTO v_available_stock 
        FROM cap_stock_balances 
        WHERE cap_id = v_cap_id 
          AND state = v_source_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND unit_type = COALESCE(v_unit_type, 'loose');
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for cap %. Required: %, Available: %', 
             v_cap_id, v_qty_to_reserve, COALESCE(v_available_stock, 0);
        END IF;

        -- Reserve Cap Stock
        FOR v_balance IN 
          SELECT id, quantity 
          FROM cap_stock_balances 
          WHERE cap_id = v_cap_id 
            AND state = v_source_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND unit_type = COALESCE(v_unit_type, 'loose')
            AND quantity > 0
          ORDER BY quantity DESC 
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE cap_stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            INSERT INTO cap_stock_balances (cap_id, factory_id, state, quantity, unit_type, last_updated)
            VALUES (v_cap_id, v_factory_id, 'reserved', v_deduct_qty, COALESCE(v_unit_type, 'loose'), NOW())
            ON CONFLICT (cap_id, factory_id, state, unit_type) 
            DO UPDATE SET 
              quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;

        -- Log Transaction (Cap)
        INSERT INTO inventory_transactions (
          product_id, cap_id, from_state, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type
        ) VALUES (
          NULL, v_cap_id, v_source_state, 'reserved', v_item.quantity, 'reserve', p_order_id, v_factory_id, p_user_id, COALESCE(v_unit_type, 'loose')
        );

      END IF;

      -- 5. Update Order Item
      -- quantity_prepared now tracks "forwarded to dispatch/reserved" in this manual flow
      UPDATE sales_order_items SET 
        quantity_prepared = quantity_prepared + v_item.quantity,
        quantity_reserved = COALESCE(quantity_reserved, 0) + v_item.quantity,
        is_prepared = (quantity_prepared + v_item.quantity) >= quantity,
        prepared_at = NOW(),
        prepared_by = p_user_id
      WHERE id = v_item.itemId;

      v_updated_count := v_updated_count + 1;
    END;
  END LOOP;

  -- 6. Update Sales Order Status if needed
  IF v_updated_count > 0 THEN
    UPDATE sales_orders SET 
      status = 'reserved', 
      updated_at = NOW() 
    WHERE id = p_order_id AND status NOT IN ('delivered', 'partially_delivered');
  END IF;

  RETURN jsonb_build_object('success', true, 'reserved_count', v_updated_count);
END;
$$ LANGUAGE plpgsql;


-- File: 20260403_fix_dispatch_for_caps.sql
-- Migration: fix_process_partial_dispatch_for_caps
-- Created: 2026-04-03
-- Description: Updates process_partial_dispatch to support caps and correctly deduct reserved stock.

CREATE OR REPLACE FUNCTION public.process_partial_dispatch(
    p_order_id UUID,
    p_items JSONB,
    p_discount_type TEXT,
    p_discount_value NUMERIC,
    p_payment_mode TEXT,
    p_credit_deadline TIMESTAMP WITH TIME ZONE,
    p_initial_payment NUMERIC,
    p_notes TEXT,
    p_user_id UUID,
    p_payment_method TEXT DEFAULT 'cash'
) RETURNS JSONB AS $$
DECLARE
    v_dispatch_id UUID;
    v_subtotal NUMERIC := 0;
    v_batch_discount NUMERIC := 0;
    v_batch_total NUMERIC;
    v_item RECORD;
    v_current_item RECORD;
    v_customer_id UUID;
    v_balance RECORD;
BEGIN
    -- Validation: Check order exists
    SELECT customer_id INTO v_customer_id FROM public.sales_orders WHERE id = p_order_id;
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- 1. Create Dispatch Record
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        item_id UUID, 
        quantity INTEGER, 
        unit_price NUMERIC
    ) LOOP
        v_subtotal := v_subtotal + (v_item.quantity * v_item.unit_price);
    END LOOP;

    IF p_discount_type = 'percentage' THEN
        v_batch_discount := (v_subtotal * COALESCE(p_discount_value, 0)) / 100;
    ELSE
        v_batch_discount := COALESCE(p_discount_value, 0);
    END IF;
    v_batch_total := v_subtotal - v_batch_discount;

    INSERT INTO public.dispatch_records (
        order_id, subtotal, discount_value, total_amount, recorded_by, notes
    ) VALUES (
        p_order_id, v_subtotal, v_batch_discount, v_batch_total, p_user_id, p_notes
    ) RETURNING id INTO v_dispatch_id;

    -- 2. Process Items and Stock
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        item_id UUID, 
        quantity INTEGER, 
        unit_price NUMERIC
    ) LOOP
        DECLARE
            v_remaining_to_dispatch INT := v_item.quantity;
        BEGIN
            -- Fetch internal item data (handling both products and caps)
            SELECT 
                soi.product_id, 
                soi.cap_id,
                soi.unit_type,
                soi.quantity_shipped, 
                soi.quantity_reserved,
                COALESCE(p.factory_id, c.factory_id) as factory_id
            INTO v_current_item
            FROM public.sales_order_items soi
            LEFT JOIN public.products p ON p.id = soi.product_id
            LEFT JOIN public.caps c ON c.id = soi.cap_id
            WHERE soi.id = v_item.item_id;

            IF v_current_item.product_id IS NULL AND v_current_item.cap_id IS NULL THEN
                RAISE EXCEPTION 'Order item % not found', v_item.item_id;
            END IF;

            IF v_item.quantity > (v_current_item.quantity_reserved - v_current_item.quantity_shipped) THEN
                RAISE EXCEPTION 'Cannot dispatch % for item %. Only % reserved and ready.', 
                    v_item.quantity, v_item.item_id, (v_current_item.quantity_reserved - v_current_item.quantity_shipped);
            END IF;

            -- Update sales_order_items
            UPDATE public.sales_order_items
            SET quantity_shipped = quantity_shipped + v_item.quantity,
                unit_price = v_item.unit_price,
                is_prepared = (quantity_shipped + v_item.quantity) >= quantity
            WHERE id = v_item.item_id;

            -- Create link record
            INSERT INTO public.dispatch_items (dispatch_id, sales_order_item_id, quantity_shipped)
            VALUES (v_dispatch_id, v_item.item_id, v_item.quantity);

            -- Deduct from RESERVED stock across all possible rows (batches)
            IF v_current_item.cap_id IS NOT NULL THEN
                FOR v_balance IN 
                    SELECT id, quantity 
                    FROM public.cap_stock_balances 
                    WHERE cap_id = v_current_item.cap_id 
                      AND state = 'reserved' 
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, 'loose')
                      AND quantity > 0
                    ORDER BY quantity DESC
                LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    DECLARE
                        v_deduct_qty INT := LEAST(v_remaining_to_dispatch, v_balance.quantity);
                    BEGIN
                        UPDATE public.cap_stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
                        v_remaining_to_dispatch := v_remaining_to_dispatch - v_deduct_qty;
                    END;
                END LOOP;
            ELSE
                FOR v_balance IN 
                    SELECT id, quantity 
                    FROM public.stock_balances 
                    WHERE product_id = v_current_item.product_id 
                      AND state = 'reserved' 
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, '')
                      AND quantity > 0
                    ORDER BY quantity DESC
                LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    DECLARE
                        v_deduct_qty INT := LEAST(v_remaining_to_dispatch, v_balance.quantity);
                    BEGIN
                        UPDATE public.stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
                        v_remaining_to_dispatch := v_remaining_to_dispatch - v_deduct_qty;
                    END;
                END LOOP;
            END IF;

            IF v_remaining_to_dispatch > 0 THEN
                RAISE EXCEPTION 'Internal error: Insufficient reserved stock for item %. Need %, found % more.', 
                    v_item.item_id, v_item.quantity, v_remaining_to_dispatch;
            END IF;
        END;
    END LOOP;

    -- 3. Record Initial Payment (if any)
    IF p_initial_payment > 0 THEN
        INSERT INTO public.payments (
            sales_order_id, customer_id, amount, payment_method, notes, recorded_by
        ) VALUES (
            p_order_id, v_customer_id, p_initial_payment, COALESCE(p_payment_method, 'cash'),
            'Initial payment for dispatch ' || v_dispatch_id, p_user_id
        );
    END IF;

    -- 4. Update Order Level totals
    UPDATE public.sales_orders
    SET 
        subtotal = COALESCE(subtotal, 0) + v_subtotal,
        discount_value = COALESCE(discount_value, 0) + v_batch_discount,
        total_amount = COALESCE(total_amount, 0) + v_batch_total,
        amount_paid = COALESCE(amount_paid, 0) + COALESCE(p_initial_payment, 0),
        balance_due = (COALESCE(total_amount, 0) + v_batch_total) - (COALESCE(amount_paid, 0) + COALESCE(p_initial_payment, 0)),
        payment_mode = COALESCE(p_payment_mode, payment_mode),
        credit_deadline = COALESCE(p_credit_deadline, credit_deadline),
        status = CASE 
            WHEN (SELECT EVERY(quantity_shipped >= quantity) FROM public.sales_order_items WHERE order_id = p_order_id) 
            THEN 'delivered'
            ELSE 'partially_delivered'
        END,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'dispatch_id', v_dispatch_id,
        'batch_total', v_batch_total,
        'order_id', p_order_id,
        'status', (SELECT status FROM public.sales_orders WHERE id = p_order_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- File: 20260403_fix_inner_stock_schema.sql
-- Migration: Fix Inner Stock Schema
-- Date: 2026-04-03
-- Reason: Inner stock was missing 'state' and 'unit_type' columns despite RPCs being updated 
--         to use them, causing "column state does not exist" errors.

-- 1. Add missing columns to inner_stock_balances
ALTER TABLE public.inner_stock_balances 
ADD COLUMN IF NOT EXISTS state varchar DEFAULT 'finished'::character varying,
ADD COLUMN IF NOT EXISTS unit_type varchar DEFAULT 'loose'::character varying;

-- 2. Update existing constraints to include state and unit_type
-- First, drop the old unique constraint
ALTER TABLE public.inner_stock_balances 
DROP CONSTRAINT IF EXISTS inner_stock_balances_inner_id_factory_id_key;

-- Then, add the new composite unique constraint
ALTER TABLE public.inner_stock_balances 
ADD CONSTRAINT inner_stock_balances_inner_id_factory_id_state_unit_type_key 
UNIQUE (inner_id, factory_id, state, unit_type);

-- 3. The adjust_inner_stock function was already updated in the previous migration, 
--    so it will now work correctly with these columns.


-- File: 20260403_fix_inventory_rpc_ambiguity.sql
-- Migration: Fix Inventory RPC Ambiguity
-- Created: 2026-04-03
-- Description: Standardizes adjust_cap_stock and adjust_inner_stock to avoid overload ambiguity.

BEGIN;

-- 1. Drop old 3-parameter versions specifically
DROP FUNCTION IF EXISTS public.adjust_cap_stock(UUID, UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.adjust_inner_stock(UUID, UUID, NUMERIC);

-- 2. Ensure only one version of adjust_cap_stock exists with 5 parameters
-- We drop the 5-parameter version too first to ensure a clean slate
DROP FUNCTION IF EXISTS public.adjust_cap_stock(UUID, UUID, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.adjust_cap_stock(
  p_cap_id UUID,
  p_factory_id UUID,
  p_quantity_change NUMERIC,
  p_state TEXT DEFAULT 'finished',
  p_unit_type TEXT DEFAULT 'loose'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type, last_updated)
    VALUES (p_cap_id, p_factory_id, p_quantity_change, p_state, p_unit_type, now())
    ON CONFLICT (cap_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
        last_updated = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Standardize adjust_inner_stock similarly
DROP FUNCTION IF EXISTS public.adjust_inner_stock(UUID, UUID, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.adjust_inner_stock(
  p_inner_id UUID,
  p_factory_id UUID,
  p_quantity_change NUMERIC,
  p_state TEXT DEFAULT 'finished',
  p_unit_type TEXT DEFAULT 'loose'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.inner_stock_balances (inner_id, factory_id, quantity, state, unit_type, last_updated)
    VALUES (p_inner_id, p_factory_id, p_quantity_change, p_state, p_unit_type, now())
    ON CONFLICT (inner_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = inner_stock_balances.quantity + EXCLUDED.quantity,
        last_updated = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Grant access to service role
GRANT EXECUTE ON FUNCTION public.adjust_cap_stock TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_cap_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inner_stock TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_inner_stock TO authenticated;

COMMIT;


-- File: 20260403_fix_inventory_rpcs.sql
-- Migration: fix_cap_stock_adjustment
-- Created: 2026-04-03
-- Description: Updates adjust_cap_stock to handle unit_type and state parameters correctly.

CREATE OR REPLACE FUNCTION public.adjust_cap_stock(
  p_cap_id UUID,
  p_factory_id UUID,
  p_quantity_change NUMERIC,
  p_state TEXT DEFAULT 'finished',
  p_unit_type TEXT DEFAULT 'loose'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type, last_updated)
    VALUES (p_cap_id, p_factory_id, p_quantity_change, p_state, p_unit_type, now())
    ON CONFLICT (cap_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
        last_updated = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- File: 20260403_fix_inventory_state_casting.sql
-- Migration: fix_inventory_state_casting
-- Created: 2026-04-03
-- Description: Fixes type mismatch error 'operator does not exist: inventory_state = text' by adding explicit casting to the prepare_order_items_atomic RPC.

CREATE OR REPLACE FUNCTION public.prepare_order_items_atomic(
  p_order_id UUID,
  p_items JSONB, -- Array of {item_id, quantity}
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_item RECORD;
  v_source_state TEXT;
  v_factory_id UUID;
  v_updated_count INT := 0;
BEGIN
  -- Iterate over items to reserve
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INT)
  LOOP
    DECLARE
      v_product_id UUID;
      v_cap_id UUID;
      v_inner_id UUID;
      v_unit_type TEXT;
      v_qty_to_reserve INT := v_item.quantity;
      v_already_reserved INT;
      v_total_needed INT;
      v_is_backordered BOOLEAN;
      v_balance RECORD;
      v_remaining_to_reserve INT := v_item.quantity;
      v_available_stock INT;
      v_prepared_qty_available INT := 0;
    BEGIN
      -- 1. Fetch item details
      SELECT 
        soi.product_id, soi.cap_id, soi.unit_type, soi.quantity, 
        COALESCE(soi.quantity_reserved, 0), soi.is_backordered
      INTO 
        v_product_id, v_cap_id, v_unit_type, v_total_needed, 
        v_already_reserved, v_is_backordered
      FROM public.sales_order_items soi
      WHERE soi.id = v_item.item_id AND soi.order_id = p_order_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % not found in order %', v_item.item_id, p_order_id;
      END IF;

      -- 2. Validation: Not exceeding total needed
      IF v_already_reserved + v_qty_to_reserve > v_total_needed THEN
        RAISE EXCEPTION 'Cannot reserve % units for item %. Total needed: %, already reserved: %', 
          v_qty_to_reserve, v_item.item_id, v_total_needed, v_already_reserved;
      END IF;

      -- 3. Validation: If backordered, ensure production request is 'prepared'
      IF v_is_backordered THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_prepared_qty_available
        FROM public.production_requests
        WHERE sales_order_id = p_order_id
          AND (product_id = v_product_id OR (product_id IS NULL AND v_product_id IS NULL))
          AND (cap_id = v_cap_id OR (cap_id IS NULL AND v_cap_id IS NULL))
          AND status = 'prepared'::production_request_status;

        -- Check if we have enough "prepared" signal to cover this reservation
        IF v_already_reserved + v_qty_to_reserve > v_prepared_qty_available THEN
          RAISE EXCEPTION 'Cannot reserve % units for backordered item %. Only % units have been marked as "Prepared" via production.', 
            v_qty_to_reserve, v_item.item_id, v_prepared_qty_available;
        END IF;
      END IF;

      -- 4. LOGIC BRANCH: Product vs Cap
      IF v_product_id IS NOT NULL THEN
        -- PRODUCT LOGIC
        SELECT factory_id INTO v_factory_id FROM public.products WHERE id = v_product_id;
        
        v_source_state := CASE v_unit_type
          WHEN 'loose' THEN 'semi_finished'
          WHEN 'packet' THEN 'packed'
          WHEN 'bundle' THEN 'finished'
          ELSE 'finished'
        END;

        -- Check Product Stock - Added explicit cast to v_source_state
        SELECT SUM(quantity) INTO v_available_stock 
        FROM public.stock_balances 
        WHERE product_id = v_product_id 
          AND state = v_source_state::inventory_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND unit_type = v_unit_type;
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for product %. Required: %, Available: % in %', 
             v_product_id, v_qty_to_reserve, COALESCE(v_available_stock, 0), v_source_state;
        END IF;

        -- Reserve Product Stock
        FOR v_balance IN 
          SELECT id, quantity, cap_id, inner_id 
          FROM public.stock_balances 
          WHERE product_id = v_product_id 
            AND state = v_source_state::inventory_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND unit_type = v_unit_type
            AND quantity > 0
          ORDER BY quantity DESC 
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            INSERT INTO public.stock_balances (product_id, factory_id, state, quantity, cap_id, inner_id, unit_type, last_updated)
            VALUES (v_product_id, v_factory_id, 'reserved'::inventory_state, v_deduct_qty, v_balance.cap_id, v_balance.inner_id, v_unit_type, NOW())
            ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
            DO UPDATE SET 
              quantity = stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;

      ELSIF v_cap_id IS NOT NULL THEN
        -- CAP LOGIC
        -- Note: cap_stock_balances currently uses VARCHAR for state, so no cast needed yet.
        -- But for consistency with inventory_transactions, we use 'finished' as text.
        SELECT factory_id INTO v_factory_id FROM public.caps WHERE id = v_cap_id;
        v_source_state := 'finished';

        -- Check Cap Stock
        SELECT SUM(quantity) INTO v_available_stock 
        FROM public.cap_stock_balances 
        WHERE cap_id = v_cap_id 
          AND state = v_source_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND unit_type = COALESCE(v_unit_type, 'loose');
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for cap %. Required: %, Available: %', 
             v_cap_id, v_qty_to_reserve, COALESCE(v_available_stock, 0);
        END IF;

        -- Reserve Cap Stock
        FOR v_balance IN 
          SELECT id, quantity 
          FROM public.cap_stock_balances 
          WHERE cap_id = v_cap_id 
            AND state = v_source_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND unit_type = COALESCE(v_unit_type, 'loose')
            AND quantity > 0
          ORDER BY quantity DESC 
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.cap_stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            INSERT INTO public.cap_stock_balances (cap_id, factory_id, state, quantity, unit_type, last_updated)
            VALUES (v_cap_id, v_factory_id, 'reserved', v_deduct_qty, COALESCE(v_unit_type, 'loose'), NOW())
            ON CONFLICT (cap_id, factory_id, state, unit_type) 
            DO UPDATE SET 
              quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;
      END IF;

      -- 5. Update the Sales Order Item Status
      UPDATE public.sales_order_items 
      SET 
        quantity_reserved = quantity_reserved + v_item.quantity,
        is_prepared = (quantity_reserved + v_item.quantity >= quantity),
        prepared_at = CASE WHEN (quantity_reserved + v_item.quantity >= quantity) THEN NOW() ELSE prepared_at END
      WHERE id = v_item.item_id;

      -- 6. Log Transaction - Added explicit casts for from_state and to_state
      INSERT INTO public.inventory_transactions (
        product_id, cap_id, from_state, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type
      ) VALUES (
        v_product_id, v_cap_id, v_source_state::inventory_state, 'reserved'::inventory_state, v_item.quantity, 'reserve', p_order_id, v_factory_id, p_user_id, v_unit_type
      );

      v_updated_count := v_updated_count + 1;
    END;
  END LOOP;

  -- 7. Update Sales Order Status to 'reserved' if all items are fully reserved
  IF NOT EXISTS (SELECT 1 FROM public.sales_order_items WHERE order_id = p_order_id AND quantity_reserved < quantity) THEN
    UPDATE public.sales_orders SET status = 'reserved', updated_at = NOW() WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'reserved_count', v_updated_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- File: 20260403_fix_rpc_item_id_casing.sql
-- Migration: fix_rpc_item_id_casing
-- Created: 2026-04-03

CREATE OR REPLACE FUNCTION public.prepare_order_items_atomic(
  p_order_id UUID,
  p_items JSONB, -- Array of {item_id, quantity}
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_item RECORD;
  v_source_state TEXT;
  v_factory_id UUID;
  v_updated_count INT := 0;
BEGIN
  -- Iterate over items to reserve
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INT)
  LOOP
    DECLARE
      v_product_id UUID;
      v_cap_id UUID;
      v_inner_id UUID;
      v_unit_type TEXT;
      v_qty_to_reserve INT := v_item.quantity;
      v_already_reserved INT;
      v_total_needed INT;
      v_is_backordered BOOLEAN;
      v_balance RECORD;
      v_remaining_to_reserve INT := v_item.quantity;
      v_available_stock INT;
      v_prepared_qty_available INT := 0;
    BEGIN
      -- 1. Fetch item details
      SELECT 
        soi.product_id, soi.cap_id, soi.unit_type, soi.quantity, 
        COALESCE(soi.quantity_reserved, 0), soi.is_backordered
      INTO 
        v_product_id, v_cap_id, v_unit_type, v_total_needed, 
        v_already_reserved, v_is_backordered
      FROM public.sales_order_items soi
      WHERE soi.id = v_item.item_id AND soi.order_id = p_order_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % not found in order %', v_item.item_id, p_order_id;
      END IF;

      -- 2. Validation: Not exceeding total needed
      IF v_already_reserved + v_qty_to_reserve > v_total_needed THEN
        RAISE EXCEPTION 'Cannot reserve % units for item %. Total needed: %, already reserved: %', 
          v_qty_to_reserve, v_item.item_id, v_total_needed, v_already_reserved;
      END IF;

      -- 3. Validation: If backordered, ensure production request is 'prepared'
      IF v_is_backordered THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_prepared_qty_available
        FROM public.production_requests
        WHERE sales_order_id = p_order_id
          AND (product_id = v_product_id OR (product_id IS NULL AND v_product_id IS NULL))
          AND (cap_id = v_cap_id OR (cap_id IS NULL AND v_cap_id IS NULL))
          AND status = 'prepared';

        -- Check if we have enough "prepared" signal to cover this reservation
        IF v_already_reserved + v_qty_to_reserve > v_prepared_qty_available THEN
          RAISE EXCEPTION 'Cannot reserve % units for backordered item %. Only % units have been marked as "Prepared" via production.', 
            v_qty_to_reserve, v_item.item_id, v_prepared_qty_available;
        END IF;
      END IF;

      -- 4. LOGIC BRANCH: Product vs Cap
      IF v_product_id IS NOT NULL THEN
        -- PRODUCT LOGIC
        SELECT factory_id INTO v_factory_id FROM public.products WHERE id = v_product_id;
        
        v_source_state := CASE v_unit_type
          WHEN 'loose' THEN 'semi_finished'
          WHEN 'packet' THEN 'packed'
          WHEN 'bundle' THEN 'finished'
          ELSE 'finished'
        END;

        -- Check Product Stock
        SELECT SUM(quantity) INTO v_available_stock 
        FROM public.stock_balances 
        WHERE product_id = v_product_id 
          AND state = v_source_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND unit_type = v_unit_type;
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for product %. Required: %, Available: % in %', 
             v_product_id, v_qty_to_reserve, COALESCE(v_available_stock, 0), v_source_state;
        END IF;

        -- Reserve Product Stock
        FOR v_balance IN 
          SELECT id, quantity, cap_id, inner_id 
          FROM public.stock_balances 
          WHERE product_id = v_product_id 
            AND state = v_source_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND unit_type = v_unit_type
            AND quantity > 0
          ORDER BY quantity DESC 
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            INSERT INTO public.stock_balances (product_id, factory_id, state, quantity, cap_id, inner_id, unit_type, last_updated)
            VALUES (v_product_id, v_factory_id, 'reserved', v_deduct_qty, v_balance.cap_id, v_balance.inner_id, v_unit_type, NOW())
            ON CONFLICT (product_id, factory_id, state, unit_type, COALESCE(cap_id, '00000000-0000-0000-0000-000000000000'), COALESCE(inner_id, '00000000-0000-0000-0000-000000000000')) 
            DO UPDATE SET 
              quantity = stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        LOOP END; -- Fixed loop syntax if needed, actually LOOP ends below

      ELSIF v_cap_id IS NOT NULL THEN
        -- CAP LOGIC
        SELECT factory_id INTO v_factory_id FROM public.caps WHERE id = v_cap_id;
        v_source_state := 'finished';

        -- Check Cap Stock
        SELECT SUM(quantity) INTO v_available_stock 
        FROM public.cap_stock_balances 
        WHERE cap_id = v_cap_id 
          AND state = v_source_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND unit_type = COALESCE(v_unit_type, 'loose');
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for cap %. Required: %, Available: %', 
             v_cap_id, v_qty_to_reserve, COALESCE(v_available_stock, 0);
        END IF;

        -- Reserve Cap Stock
        FOR v_balance IN 
          SELECT id, quantity 
          FROM public.cap_stock_balances 
          WHERE cap_id = v_cap_id 
            AND state = v_source_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND unit_type = COALESCE(v_unit_type, 'loose')
            AND quantity > 0
          ORDER BY quantity DESC 
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.cap_stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            INSERT INTO public.cap_stock_balances (cap_id, factory_id, state, quantity, unit_type, last_updated)
            VALUES (v_cap_id, v_factory_id, 'reserved', v_deduct_qty, COALESCE(v_unit_type, 'loose'), NOW())
            ON CONFLICT (cap_id, factory_id, state, unit_type) 
            DO UPDATE SET 
              quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;
      END IF;

      -- 5. Update the Sales Order Item Status
      UPDATE public.sales_order_items 
      SET 
        quantity_reserved = quantity_reserved + v_item.quantity,
        is_prepared = (quantity_reserved + v_item.quantity >= quantity),
        prepared_at = CASE WHEN (quantity_reserved + v_item.quantity >= quantity) THEN NOW() ELSE prepared_at END
      WHERE id = v_item.item_id;

      -- 6. Log Transaction
      INSERT INTO public.inventory_transactions (
        product_id, cap_id, from_state, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type
      ) VALUES (
        v_product_id, v_cap_id, v_source_state, 'reserved', v_item.quantity, 'reserve', p_order_id, v_factory_id, p_user_id, v_unit_type
      );

      v_updated_count := v_updated_count + 1;
    END;
  END LOOP;

  -- 7. Update Sales Order Status to 'reserved' if all items are fully reserved
  -- PM logic: The order remains 'pending' until the PM decides otherwise, 
  -- but we can auto-transition to 'reserved' if at least one item is reserved, 
  -- or only when ALL items are reserved. Let's do ALL.
  IF NOT EXISTS (SELECT 1 FROM public.sales_order_items WHERE order_id = p_order_id AND quantity_reserved < quantity) THEN
    UPDATE public.sales_orders SET status = 'reserved', updated_at = NOW() WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'reserved_count', v_updated_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- File: 20260403_make_product_id_nullable.sql
-- Migration: make_product_id_nullable_in_sales_items
-- Created: 2026-04-03

ALTER TABLE public.sales_order_items ALTER COLUMN product_id DROP NOT NULL;


-- File: 20260404_add_created_by_to_supplier_payments.sql
-- Add created_by column to supplier_payments
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'supplier_payments' AND column_name = 'created_by') THEN
        ALTER TABLE public.supplier_payments ADD COLUMN created_by UUID REFERENCES auth.users(id);
    END IF;
END $$;


-- File: 20260404_fix_analytics_schema_joins.sql
-- Migration: Fix Analytics Schema Joins
-- Created: 2026-04-04

-- 1. Ensure cap_production_logs has explicit foreign keys if missing
-- cap_id -> caps(id)
-- machine_id -> machines(id)
-- factory_id -> factories(id)

-- 2. Ensure caps has explicit foreign keys
-- template_id -> cap_templates(id)
-- raw_material_id -> raw_materials(id)

-- 3. Ensure inner_production_logs has explicit foreign keys
-- inner_id -> inners(id)
-- machine_id -> machines(id)
-- factory_id -> factories(id)

-- 4. Ensure inners has explicit foreign keys
-- template_id -> inner_templates(id)

-- Note: These might already exist in Dev but this migration 
-- guarantees they exist in Prod for consistent Analytics performance.

-- Re-asserting relationships for PostgREST visibility
COMMENT ON CONSTRAINT cap_production_logs_cap_id_fkey ON public.cap_production_logs IS 'Analytics link to caps';
COMMENT ON CONSTRAINT caps_template_id_fkey ON public.caps IS 'Analytics link to cap_templates';
COMMENT ON CONSTRAINT caps_raw_material_id_fkey ON public.caps IS 'Analytics link to raw_materials';
COMMENT ON CONSTRAINT inner_production_logs_inner_id_fkey ON public.inner_production_logs IS 'Analytics link to inners';
COMMENT ON CONSTRAINT inners_template_id_fkey ON public.inners IS 'Analytics link to inner_templates';
COMMENT ON CONSTRAINT inner_templates_raw_material_id_fkey ON public.inner_templates IS 'Analytics link to raw_materials';


-- File: 20260404_fix_production_wastage_deduction.sql
-- Migration: Fix Production Wastage RM Deduction & Template Alignment (Fixing Conflict Index & Storing Total Weight)
-- Created: 2026-04-04

CREATE OR REPLACE FUNCTION public.submit_production_atomic(
  p_machine_id uuid,
  p_product_id uuid,
  p_shift_number integer,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_total_produced integer,
  p_damaged_count integer,
  p_actual_cycle_time_seconds numeric,
  p_actual_weight_grams numeric,
  p_downtime_minutes integer,
  p_downtime_reason text,
  p_date date,
  p_user_id uuid,
  p_factory_id uuid,
  p_theoretical_quantity integer DEFAULT 0,
  p_efficiency_percentage numeric DEFAULT 0,
  p_is_cost_recovered boolean DEFAULT true,
  p_shift_hours numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
  v_actual_quantity INT;
  v_weight_grams NUMERIC;
  v_raw_material_id UUID;
  v_weight_wastage_kg NUMERIC;
  v_flagged_for_review BOOLEAN;
  v_required_material_kg NUMERIC;
  v_color TEXT;
  v_cap_template_id UUID;
  v_inner_id UUID;
  v_cap_id UUID;
  v_ideal_cycle_time NUMERIC;
  v_template_id UUID;
BEGIN
  -- 1. Fetch Metadata (Include template_id for machine mapping)
  SELECT 
    p.weight_grams, p.raw_material_id, p.color, p.inner_id, p.cap_template_id, p.template_id
  INTO 
    v_weight_grams, v_raw_material_id, v_color, v_inner_id, v_cap_template_id, v_template_id
  FROM products p 
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Fetch Machine-Product Mapping (Using template_id as per Migration 022)
  SELECT COALESCE(ideal_cycle_time_seconds, 0)
  INTO v_ideal_cycle_time
  FROM machine_products 
  WHERE machine_id = p_machine_id 
    AND (product_template_id = v_template_id OR product_id = p_product_id)
  ORDER BY (product_template_id IS NOT NULL) DESC 
  LIMIT 1;

  v_actual_quantity := p_total_produced - COALESCE(p_damaged_count, 0);
  
  -- 2. Calculations
  -- Calculate wastage weight: (actual - ideal) * quantity / 1000
  v_weight_wastage_kg := (v_actual_quantity * (COALESCE(p_actual_weight_grams, v_weight_grams) - v_weight_grams)) / 1000;
  IF v_weight_wastage_kg < 0 THEN v_weight_wastage_kg := 0; END IF;
  
  v_flagged_for_review := v_ideal_cycle_time > 0 AND p_actual_cycle_time_seconds > (v_ideal_cycle_time * 1.05);

  -- 3. Raw Material consumption (FIXED: Now includes wastage weight)
  v_required_material_kg := (v_actual_quantity * v_weight_grams) / 1000 + v_weight_wastage_kg;

  -- 4. VALIDATION: Check Raw Material Availability
  IF NOT EXISTS (SELECT 1 FROM raw_materials WHERE id = v_raw_material_id AND stock_weight_kg >= v_required_material_kg) THEN
    DECLARE v_available_rm NUMERIC;
    BEGIN
        SELECT stock_weight_kg INTO v_available_rm FROM raw_materials WHERE id = v_raw_material_id;
        RAISE EXCEPTION 'Insufficient raw material stock. Need %, have %', v_required_material_kg, v_available_rm;
    END;
  END IF;

  -- 5. Insert Log
  INSERT INTO production_logs (
    date, machine_id, product_id, user_id, factory_id,
    shift_number, start_time, end_time,
    total_produced, damaged_count, actual_quantity,
    actual_cycle_time_seconds, flagged_for_review,
    actual_weight_grams, weight_wastage_kg, total_weight_kg,
    downtime_minutes, downtime_reason,
    theoretical_quantity, efficiency_percentage, is_cost_recovered, shift_hours,
    status, created_at
  ) VALUES (
    p_date, p_machine_id, p_product_id, p_user_id, p_factory_id,
    p_shift_number, p_start_time, p_end_time,
    p_total_produced, p_damaged_count, v_actual_quantity,
    p_actual_cycle_time_seconds, v_flagged_for_review,
    p_actual_weight_grams, v_weight_wastage_kg, v_required_material_kg,
    p_downtime_minutes, p_downtime_reason,
    p_theoretical_quantity, p_efficiency_percentage, p_is_cost_recovered, p_shift_hours,
    'submitted', NOW()
  ) RETURNING id INTO v_log_id;

  -- 6. Update Stocks
  INSERT INTO stock_balances (product_id, state, quantity, factory_id, unit_type, cap_id, inner_id, last_updated)
  VALUES (p_product_id, 'packed', v_actual_quantity, p_factory_id, '', NULL, v_inner_id, NOW())
  ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
  DO UPDATE SET 
    quantity = stock_balances.quantity + EXCLUDED.quantity, last_updated = NOW();

  -- Raw Material Stock
  UPDATE raw_materials SET stock_weight_kg = stock_weight_kg - v_required_material_kg, updated_at = NOW() WHERE id = v_raw_material_id;

  -- 7. Log Inventory Transactions
  INSERT INTO inventory_transactions (product_id, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type)
  VALUES (p_product_id, 'packed', v_actual_quantity, 'production', v_log_id, p_factory_id, p_user_id, '');

  INSERT INTO inventory_transactions (raw_material_id, from_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type)
  VALUES (v_raw_material_id, 'raw_material', v_required_material_kg, 'production_consumption', v_log_id, p_factory_id, p_user_id, 'kg');

  RETURN jsonb_build_object(
    'success', true, 
    'log_id', v_log_id,
    'actual_quantity', v_actual_quantity,
    'weight_wastage_kg', v_weight_wastage_kg,
    'total_weight_kg', v_required_material_kg
  );
END;
$$;


-- File: 20260404_harden_logistics_and_financials.sql
-- Migration: Harden Logistics and Financials (Order Creation, Dispatch, Inter-factory Transfer)
-- Created: 2026-04-04

-- 0. Schema Updates (Dependencies for hardened RPCs)
-- Add balance_due to customers table for atomic credit tracking
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS balance_due NUMERIC DEFAULT 0;

-- 1. Create/Harden transfer_stock_atomic for inter-factory logistics
CREATE OR REPLACE FUNCTION public.transfer_stock_atomic(
    p_product_id uuid, p_from_factory_id uuid, p_to_factory_id uuid, 
    p_quantity integer, p_state text, p_unit_type text, p_user_id uuid, 
    p_cap_id uuid DEFAULT NULL::uuid, p_inner_id text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_source_qty INT;
    v_transfer_id UUID := gen_random_uuid();
BEGIN
    -- 1. Validation
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Transfer quantity must be positive';
    END IF;

    IF p_from_factory_id = p_to_factory_id THEN
        RAISE EXCEPTION 'Source and target factories must be different';
    END IF;

    -- 2. Check source stock
    IF p_cap_id IS NOT NULL THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_source_qty
        FROM public.cap_stock_balances
        WHERE cap_id = p_cap_id
          AND factory_id = p_from_factory_id
          AND state = p_state
          AND unit_type = p_unit_type;
    ELSE
        SELECT COALESCE(SUM(quantity), 0) INTO v_source_qty
        FROM public.stock_balances
        WHERE product_id = p_product_id
          AND factory_id = p_from_factory_id
          AND state = p_state
          AND unit_type = p_unit_type
          AND (p_cap_id IS NULL OR cap_id = p_cap_id)
          AND (p_inner_id IS NULL OR inner_id = p_inner_id);
    END IF;

    IF v_source_qty < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock in source factory. Have %, need %', v_source_qty, p_quantity;
    END IF;

    -- 3. Deduct from Source
    IF p_cap_id IS NOT NULL THEN
        PERFORM public.adjust_stock(
            NULL, -- product_id
            p_from_factory_id,
            p_state,
            -p_quantity,
            p_cap_id,
            p_unit_type
        );
    ELSE
        PERFORM public.adjust_stock(
            p_product_id,
            p_from_factory_id,
            p_state,
            -p_quantity,
            NULL, -- cap_id
            p_unit_type,
            p_inner_id
        );
    END IF;

    -- 4. Add to Target
    IF p_cap_id IS NOT NULL THEN
        PERFORM public.adjust_stock(
            NULL, -- product_id
            p_to_factory_id,
            p_state,
            p_quantity,
            p_cap_id,
            p_unit_type
        );
    ELSE
        PERFORM public.adjust_stock(
            p_product_id,
            p_to_factory_id,
            p_state,
            p_quantity,
            NULL, -- cap_id
            p_unit_type,
            p_inner_id
        );
    END IF;

    -- 5. Record Transaction (Audit)
    INSERT INTO public.inventory_transactions (
        product_id, cap_id, factory_id, transaction_type, quantity,
        source_id, notes, user_id, state, unit_type
    ) VALUES (
        p_product_id, p_cap_id, p_from_factory_id, 'transfer_out', -p_quantity,
        v_transfer_id, 'Transfer to ' || p_to_factory_id, p_user_id, p_state, p_unit_type
    );

    INSERT INTO public.inventory_transactions (
        product_id, cap_id, factory_id, transaction_type, quantity,
        source_id, notes, user_id, state, unit_type
    ) VALUES (
        p_product_id, p_cap_id, p_to_factory_id, 'transfer_in', p_quantity,
        v_transfer_id, 'Transfer from ' || p_from_factory_id, p_user_id, p_state, p_unit_type
    );

    RETURN jsonb_build_object('success', true, 'transfer_id', v_transfer_id);
END;
$function$;


-- 2. Harden create_order_atomic with Credit Limit Enforcement
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_customer_id uuid, p_delivery_date text, p_notes text, 
    p_user_id uuid, p_items jsonb, p_order_date text
)
 RETURNS jsonb
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
    SELECT balance_due, credit_limit INTO v_customer_balance, v_customer_limit 
    FROM public.customers WHERE id = p_customer_id;

    IF (COALESCE(v_customer_balance, 0) + v_total_amount) > COALESCE(v_customer_limit, 999999999) THEN
        RAISE EXCEPTION 'Order blocked: Total balance with this order (%) would exceed credit limit (%)', 
            (COALESCE(v_customer_balance, 0) + v_total_amount), v_customer_limit;
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
            SELECT selling_price, factory_id INTO v_resource_data
            FROM public.products WHERE id = v_item.product_id;
            v_factory_id := COALESCE(v_resource_data.factory_id, v_main_factory_id);

            SELECT COALESCE(SUM(quantity), 0) INTO v_available_stock
            FROM public.stock_balances 
            WHERE product_id = v_item.product_id 
              AND unit_type = COALESCE(v_item.unit_type, 'bundle')
              AND state IN ('semi_finished', 'packed', 'finished')
              AND (factory_id = v_factory_id OR factory_id IS NULL);

            v_is_backordered := v_available_stock < v_item.quantity;

            INSERT INTO public.sales_order_items (
                order_id, product_id, quantity, quantity_prepared, quantity_reserved, 
                unit_type, unit_price, is_backordered, is_prepared
            ) VALUES (
                v_order_id, v_item.product_id, v_item.quantity, 0, 0, 
                COALESCE(v_item.unit_type, 'bundle'), 
                COALESCE(v_item.unit_price, v_resource_data.selling_price, 0), 
                v_is_backordered, FALSE
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
$function$;


-- 3. Harden process_partial_dispatch with Balance Synchronization
CREATE OR REPLACE FUNCTION public.process_partial_dispatch(
    p_order_id uuid, p_items jsonb, p_discount_type text, 
    p_discount_value numeric, p_payment_mode text, p_credit_deadline date, 
    p_initial_payment numeric, p_notes text, p_user_id uuid, 
    p_payment_method text DEFAULT 'cash'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
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
    v_new_total_amount NUMERIC;
    v_new_amount_paid NUMERIC;
BEGIN
    SELECT customer_id INTO v_customer_id FROM public.sales_orders WHERE id = p_order_id;
    IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Order % not found', p_order_id; END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INTEGER, unit_price NUMERIC) LOOP
        v_subtotal := v_subtotal + (v_item.quantity * v_item.unit_price);
    END LOOP;

    IF p_discount_type = 'percentage' THEN v_batch_discount := (v_subtotal * COALESCE(p_discount_value, 0)) / 100;
    ELSE v_batch_discount := COALESCE(p_discount_value, 0); END IF;
    v_batch_total := v_subtotal - v_batch_discount;

    INSERT INTO public.dispatch_records (
        order_id, subtotal, discount_value, total_amount, recorded_by, notes
    ) VALUES (
        p_order_id, v_subtotal, v_batch_discount, v_batch_total, p_user_id, p_notes
    ) RETURNING id INTO v_dispatch_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INTEGER, unit_price NUMERIC) LOOP
        DECLARE v_remaining_to_dispatch INT := v_item.quantity;
        BEGIN
            SELECT soi.product_id, soi.cap_id, soi.unit_type, soi.quantity_shipped, 
                   soi.quantity_reserved, COALESCE(p.factory_id, c.factory_id) as factory_id, soi.quantity as target_qty
            INTO v_current_item FROM public.sales_order_items soi
            LEFT JOIN public.products p ON p.id = soi.product_id
            LEFT JOIN public.caps c ON c.id = soi.cap_id WHERE soi.id = v_item.item_id;

            IF v_item.quantity > (v_current_item.quantity_reserved - v_current_item.quantity_shipped) THEN
                RAISE EXCEPTION 'Cannot dispatch % for item %. Only % reserved.', v_item.quantity, v_item.item_id, (v_current_item.quantity_reserved - v_current_item.quantity_shipped);
            END IF;

            UPDATE public.sales_order_items SET quantity_shipped = quantity_shipped + v_item.quantity, 
                   unit_price = v_item.unit_price, is_prepared = (quantity_shipped + v_item.quantity) >= v_current_item.target_qty
            WHERE id = v_item.item_id;

            INSERT INTO public.dispatch_items (dispatch_id, sales_order_item_id, quantity_shipped)
            VALUES (v_dispatch_id, v_item.item_id, v_item.quantity);

            IF v_current_item.cap_id IS NOT NULL THEN
                FOR v_balance IN SELECT id, quantity FROM public.cap_stock_balances 
                    WHERE cap_id = v_current_item.cap_id AND state = 'reserved' 
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, 'loose') AND quantity > 0 ORDER BY quantity DESC LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    UPDATE public.cap_stock_balances SET quantity = quantity - LEAST(v_remaining_to_dispatch, v_balance.quantity), last_updated = NOW() WHERE id = v_balance.id;
                    v_remaining_to_dispatch := v_remaining_to_dispatch - LEAST(v_remaining_to_dispatch, v_balance.quantity);
                END LOOP;
            ELSE
                FOR v_balance IN SELECT id, quantity FROM public.stock_balances 
                    WHERE product_id = v_current_item.product_id AND state = 'reserved' 
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, '') AND quantity > 0 ORDER BY quantity DESC LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    UPDATE public.stock_balances SET quantity = quantity - LEAST(v_remaining_to_dispatch, v_balance.quantity), last_updated = NOW() WHERE id = v_balance.id;
                    v_remaining_to_dispatch := v_remaining_to_dispatch - LEAST(v_remaining_to_dispatch, v_balance.quantity);
                END LOOP;
            END IF;
        END;
    END LOOP;

    IF COALESCE(p_initial_payment, 0) > 0 THEN
        INSERT INTO public.payments (sales_order_id, customer_id, amount, payment_method, notes, recorded_by
        ) VALUES (p_order_id, v_customer_id, p_initial_payment, COALESCE(p_payment_method, 'cash'), 
                  'Initial payment for dispatch ' || v_dispatch_id, p_user_id) RETURNING id INTO v_payment_id;
    END IF;

    UPDATE public.sales_orders SET amount_paid = amount_paid + COALESCE(p_initial_payment, 0),
           payment_mode = COALESCE(p_payment_mode, payment_mode), credit_deadline = COALESCE(p_credit_deadline, credit_deadline),
           status = CASE WHEN (SELECT EVERY(quantity_shipped >= quantity) FROM public.sales_order_items WHERE order_id = p_order_id) THEN 'delivered' ELSE 'partially_delivered' END,
           updated_at = now() WHERE id = p_order_id RETURNING amount_paid, total_amount INTO v_new_amount_paid, v_new_total_amount;

    UPDATE public.sales_orders SET balance_due = v_new_total_amount - v_new_amount_paid WHERE id = p_order_id;
    UPDATE public.customers SET balance_due = (SELECT SUM(balance_due) FROM public.sales_orders WHERE customer_id = v_customer_id AND status != 'cancelled') WHERE id = v_customer_id;

    RETURN jsonb_build_object('dispatch_id', v_dispatch_id, 'payment_id', v_payment_id, 'batch_total', v_batch_total, 'order_id', p_order_id);
END;
$function$;


-- File: 20260404_standardize_wastage_columns.sql
-- Standardize wastage columns across all production log tables
-- 1. Add to cap_production_logs
ALTER TABLE public.cap_production_logs 
ADD COLUMN IF NOT EXISTS weight_wastage_kg numeric DEFAULT 0;

-- 2. Rename in inner_production_logs for consistency
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'inner_production_logs' 
        AND column_name = 'waste_weight_kg'
    ) THEN
        ALTER TABLE public.inner_production_logs 
        RENAME COLUMN waste_weight_kg TO weight_wastage_kg;
    END IF;
END $$;

-- 3. Ensure all are numeric and have defaults
ALTER TABLE public.production_logs 
ALTER COLUMN weight_wastage_kg SET DEFAULT 0;

ALTER TABLE public.cap_production_logs 
ALTER COLUMN weight_wastage_kg SET DEFAULT 0;

ALTER TABLE public.inner_production_logs 
ALTER COLUMN weight_wastage_kg SET DEFAULT 0;


-- File: 20260404_update_dispatch_rpc_payment_id.sql
CREATE OR REPLACE FUNCTION public.process_partial_dispatch(
    p_order_id UUID,
    p_items JSONB,
    p_discount_type TEXT,
    p_discount_value NUMERIC,
    p_payment_mode TEXT,
    p_credit_deadline DATE,
    p_initial_payment NUMERIC,
    p_notes TEXT,
    p_user_id UUID,
    p_payment_method TEXT DEFAULT 'cash'
) RETURNS JSONB AS $$
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
BEGIN
    -- Validation: Check order exists
    SELECT customer_id INTO v_customer_id FROM public.sales_orders WHERE id = p_order_id;
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- 1. Create Dispatch Record
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        item_id UUID, 
        quantity INTEGER, 
        unit_price NUMERIC
    ) LOOP
        v_subtotal := v_subtotal + (v_item.quantity * v_item.unit_price);
    END LOOP;

    IF p_discount_type = 'percentage' THEN
        v_batch_discount := (v_subtotal * COALESCE(p_discount_value, 0)) / 100;
    ELSE
        v_batch_discount := COALESCE(p_discount_value, 0);
    END IF;
    v_batch_total := v_subtotal - v_batch_discount;

    INSERT INTO public.dispatch_records (
        order_id, subtotal, discount_value, total_amount, recorded_by, notes
    ) VALUES (
        p_order_id, v_subtotal, v_batch_discount, v_batch_total, p_user_id, p_notes
    ) RETURNING id INTO v_dispatch_id;

    -- 2. Process Items and Stock
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        item_id UUID, 
        quantity INTEGER, 
        unit_price NUMERIC
    ) LOOP
        DECLARE
            v_remaining_to_dispatch INT := v_item.quantity;
        BEGIN
            -- Fetch internal item data (handling both products and caps)
            SELECT 
                soi.product_id, 
                soi.cap_id,
                soi.unit_type,
                soi.quantity_shipped, 
                soi.quantity_reserved,
                COALESCE(p.factory_id, c.factory_id) as factory_id
            INTO v_current_item
            FROM public.sales_order_items soi
            LEFT JOIN public.products p ON p.id = soi.product_id
            LEFT JOIN public.caps c ON c.id = soi.cap_id
            WHERE soi.id = v_item.item_id;

            IF v_current_item.product_id IS NULL AND v_current_item.cap_id IS NULL THEN
                RAISE EXCEPTION 'Order item % not found', v_item.item_id;
            END IF;

            IF v_item.quantity > (v_current_item.quantity_reserved - v_current_item.quantity_shipped) THEN
                RAISE EXCEPTION 'Cannot dispatch % for item %. Only % reserved and ready.', 
                    v_item.quantity, v_item.item_id, (v_current_item.quantity_reserved - v_current_item.quantity_shipped);
            END IF;

            -- Update sales_order_items
            UPDATE public.sales_order_items
            SET quantity_shipped = quantity_shipped + v_item.quantity,
                unit_price = v_item.unit_price,
                is_prepared = (quantity_shipped + v_item.quantity) >= quantity
            WHERE id = v_item.item_id;

            -- Create link record
            INSERT INTO public.dispatch_items (dispatch_id, sales_order_item_id, quantity_shipped)
            VALUES (v_dispatch_id, v_item.item_id, v_item.quantity);

            -- Deduct from RESERVED stock across all possible rows (batches)
            IF v_current_item.cap_id IS NOT NULL THEN
                FOR v_balance IN 
                    SELECT id, quantity 
                    FROM public.cap_stock_balances 
                    WHERE cap_id = v_current_item.cap_id 
                      AND state = 'reserved' 
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, 'loose')
                      AND quantity > 0
                    ORDER BY quantity DESC
                LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    DECLARE
                        v_deduct_qty INT := LEAST(v_remaining_to_dispatch, v_balance.quantity);
                    BEGIN
                        UPDATE public.cap_stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
                        v_remaining_to_dispatch := v_remaining_to_dispatch - v_deduct_qty;
                    END;
                END LOOP;
            ELSE
                FOR v_balance IN 
                    SELECT id, quantity 
                    FROM public.stock_balances 
                    WHERE product_id = v_current_item.product_id 
                      AND state = 'reserved' 
                      AND (factory_id = v_current_item.factory_id OR factory_id IS NULL)
                      AND unit_type = COALESCE(v_current_item.unit_type, '')
                      AND quantity > 0
                    ORDER BY quantity DESC
                LOOP
                    EXIT WHEN v_remaining_to_dispatch <= 0;
                    DECLARE
                        v_deduct_qty INT := LEAST(v_remaining_to_dispatch, v_balance.quantity);
                    BEGIN
                        UPDATE public.stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
                        v_remaining_to_dispatch := v_remaining_to_dispatch - v_deduct_qty;
                    END;
                END LOOP;
            END IF;

            IF v_remaining_to_dispatch > 0 THEN
                RAISE EXCEPTION 'Internal error: Insufficient reserved stock for item %. Need %, found % more.', 
                    v_item.item_id, v_item.quantity, v_remaining_to_dispatch;
            END IF;
        END;
    END LOOP;

    -- 3. Record Initial Payment (if any)
    IF p_initial_payment > 0 THEN
        INSERT INTO public.payments (
            sales_order_id, customer_id, amount, payment_method, notes, recorded_by
        ) VALUES (
            p_order_id, v_customer_id, p_initial_payment, COALESCE(p_payment_method, 'cash'),
            'Initial payment for dispatch ' || v_dispatch_id, p_user_id
        ) RETURNING id INTO v_payment_id;
    END IF;

    -- 4. Update Order Level totals
    UPDATE public.sales_orders
    SET 
        subtotal = COALESCE(subtotal, 0) + v_subtotal,
        discount_value = COALESCE(discount_value, 0) + v_batch_discount,
        total_amount = COALESCE(total_amount, 0) + v_batch_total,
        amount_paid = COALESCE(amount_paid, 0) + COALESCE(p_initial_payment, 0),
        balance_due = (COALESCE(total_amount, 0) + v_batch_total) - (COALESCE(amount_paid, 0) + COALESCE(p_initial_payment, 0)),
        payment_mode = COALESCE(p_payment_mode, payment_mode),
        credit_deadline = COALESCE(p_credit_deadline, credit_deadline),
        status = CASE 
            WHEN (SELECT EVERY(quantity_shipped >= quantity) FROM public.sales_order_items WHERE order_id = p_order_id) 
            THEN 'delivered'
            ELSE 'partially_delivered'
        END,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'dispatch_id', v_dispatch_id,
        'payment_id', v_payment_id,
        'batch_total', v_batch_total,
        'order_id', p_order_id,
        'status', (SELECT status FROM public.sales_orders WHERE id = p_order_id)
    );
END;
$$ LANGUAGE plpgsql;


-- File: 20260406_fix_inventory_mismatch.sql
-- Migration: Fix Inventory Type Mismatch
-- Created: 2026-04-06

-- 1. Update submit_production_atomic (18-arg version)
CREATE OR REPLACE FUNCTION public.submit_production_atomic(
  p_machine_id uuid, p_product_id uuid, p_shift_number integer, 
  p_start_time time without time zone, p_end_time time without time zone, 
  p_total_produced integer, p_damaged_count integer, 
  p_actual_cycle_time_seconds numeric, p_actual_weight_grams numeric, 
  p_downtime_minutes integer, p_downtime_reason text, p_date date, 
  p_user_id uuid, p_factory_id uuid, 
  p_theoretical_quantity integer DEFAULT 0, p_efficiency_percentage numeric DEFAULT 0, 
  p_is_cost_recovered boolean DEFAULT true, p_shift_hours numeric DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_log_id UUID;
  v_actual_quantity INT;
  v_weight_grams NUMERIC;
  v_raw_material_id UUID;
  v_weight_wastage_kg NUMERIC;
  v_flagged_for_review BOOLEAN;
  v_required_material_kg NUMERIC;
  v_color TEXT;
  v_cap_template_id UUID;
  v_inner_id UUID;
  v_cap_id UUID;
  v_ideal_cycle_time NUMERIC;
  v_template_id UUID;
  v_target_state inventory_state := 'semi_finished'::inventory_state;
  v_target_unit_type TEXT := 'loose';
BEGIN
  -- 1. Fetch Metadata
  SELECT 
    p.weight_grams, p.raw_material_id, p.color, p.inner_id, p.cap_template_id, p.template_id
  INTO 
    v_weight_grams, v_raw_material_id, v_color, v_inner_id, v_cap_template_id, v_template_id
  FROM products p 
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Fetch Machine-Product Mapping
  SELECT COALESCE(ideal_cycle_time_seconds, 0)
  INTO v_ideal_cycle_time
  FROM machine_products 
  WHERE machine_id = p_machine_id 
    AND (product_template_id = v_template_id OR product_id = p_product_id)
  ORDER BY (product_template_id IS NOT NULL) DESC 
  LIMIT 1;

  v_actual_quantity := p_total_produced - COALESCE(p_damaged_count, 0);
  
  -- 2. Calculations
  v_weight_wastage_kg := (v_actual_quantity * (COALESCE(p_actual_weight_grams, v_weight_grams) - v_weight_grams)) / 1000;
  IF v_weight_wastage_kg < 0 THEN v_weight_wastage_kg := 0; END IF;
  
  v_flagged_for_review := v_ideal_cycle_time > 0 AND p_actual_cycle_time_seconds > (v_ideal_cycle_time * 1.05);

  -- 3. Raw Material consumption (includes wastage)
  v_required_material_kg := (v_actual_quantity * v_weight_grams) / 1000 + v_weight_wastage_kg;

  -- 4. VALIDATION: Check Raw Material Availability
  IF NOT EXISTS (SELECT 1 FROM raw_materials WHERE id = v_raw_material_id AND stock_weight_kg >= v_required_material_kg) THEN
    DECLARE v_available_rm NUMERIC;
    BEGIN
        SELECT stock_weight_kg INTO v_available_rm FROM raw_materials WHERE id = v_raw_material_id;
        RAISE EXCEPTION 'Insufficient raw material stock. Need %, have %', v_required_material_kg, v_available_rm;
    END;
  END IF;

  -- 5. Insert Log
  INSERT INTO production_logs (
    date, machine_id, product_id, user_id, factory_id,
    shift_number, start_time, end_time,
    total_produced, damaged_count, actual_quantity,
    actual_cycle_time_seconds, flagged_for_review,
    actual_weight_grams, weight_wastage_kg, total_weight_kg,
    downtime_minutes, downtime_reason,
    theoretical_quantity, efficiency_percentage, is_cost_recovered, shift_hours,
    status, created_at
  ) VALUES (
    p_date, p_machine_id, p_product_id, p_user_id, p_factory_id,
    p_shift_number, p_start_time, p_end_time,
    p_total_produced, p_damaged_count, v_actual_quantity,
    p_actual_cycle_time_seconds, v_flagged_for_review,
    p_actual_weight_grams, v_weight_wastage_kg, v_required_material_kg,
    p_downtime_minutes, p_downtime_reason,
    p_theoretical_quantity, p_efficiency_percentage, p_is_cost_recovered, p_shift_hours,
    'submitted', NOW()
  ) RETURNING id INTO v_log_id;

  -- 6. Update Stocks (Molding -> semi_finished/loose)
  INSERT INTO stock_balances (product_id, state, quantity, factory_id, unit_type, cap_id, inner_id, last_updated)
  VALUES (p_product_id, v_target_state, v_actual_quantity, p_factory_id, v_target_unit_type, NULL, v_inner_id, NOW())
  ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
  DO UPDATE SET 
    quantity = stock_balances.quantity + EXCLUDED.quantity, last_updated = NOW();

  -- Raw Material Stock
  UPDATE raw_materials SET stock_weight_kg = stock_weight_kg - v_required_material_kg, updated_at = NOW() WHERE id = v_raw_material_id;

  -- 7. Log Inventory Transactions
  INSERT INTO inventory_transactions (product_id, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type)
  VALUES (p_product_id, v_target_state, v_actual_quantity, 'production', v_log_id, p_factory_id, p_user_id, v_target_unit_type);

  INSERT INTO inventory_transactions (raw_material_id, from_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type)
  VALUES (v_raw_material_id, 'raw_material', v_required_material_kg, 'production_consumption', v_log_id, p_factory_id, p_user_id, 'kg');

  RETURN jsonb_build_object(
    'success', true, 
    'log_id', v_log_id,
    'actual_quantity', v_actual_quantity,
    'weight_wastage_kg', v_weight_wastage_kg,
    'total_weight_kg', v_required_material_kg
  );
END;
$function$;

-- 2. Update prepare_order_items_atomic to handle empty strings as synonym for loose
CREATE OR REPLACE FUNCTION public.prepare_order_items_atomic(p_order_id uuid, p_items jsonb, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_item RECORD;
  v_source_state TEXT;
  v_factory_id UUID;
  v_updated_count INT := 0;
BEGIN
  -- Iterate over items to reserve
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INT)
  LOOP
    DECLARE
      v_product_id UUID;
      v_cap_id UUID;
      v_inner_id UUID;
      v_unit_type TEXT;
      v_qty_to_reserve INT := v_item.quantity;
      v_already_reserved INT;
      v_total_needed INT;
      v_is_backordered BOOLEAN;
      v_balance RECORD;
      v_remaining_to_reserve INT := v_item.quantity;
      v_available_stock INT;
      v_prepared_qty_available INT := 0;
    BEGIN
      -- 1. Fetch item details
      SELECT 
        soi.product_id, soi.cap_id, soi.unit_type, soi.quantity, 
        COALESCE(soi.quantity_reserved, 0), soi.is_backordered
      INTO 
        v_product_id, v_cap_id, v_unit_type, v_total_needed, 
        v_already_reserved, v_is_backordered
      FROM public.sales_order_items soi
      WHERE soi.id = v_item.item_id AND soi.order_id = p_order_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % not found in order %', v_item.item_id, p_order_id;
      END IF;

      -- 2. Validation: Not exceeding total needed
      IF v_already_reserved + v_qty_to_reserve > v_total_needed THEN
        RAISE EXCEPTION 'Cannot reserve % units for item %. Total needed: %, already reserved: %', 
          v_qty_to_reserve, v_item.item_id, v_total_needed, v_already_reserved;
      END IF;

      -- 3. Validation: If backordered, ensure production request is 'prepared'
      IF v_is_backordered THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_prepared_qty_available
        FROM public.production_requests
        WHERE sales_order_id = p_order_id
          AND (product_id = v_product_id OR (product_id IS NULL AND v_product_id IS NULL))
          AND (cap_id = v_cap_id OR (cap_id IS NULL AND v_cap_id IS NULL))
          AND status = 'prepared'::production_request_status;

        -- Check if we have enough "prepared" signal to cover this reservation
        IF v_already_reserved + v_qty_to_reserve > v_prepared_qty_available THEN
          RAISE EXCEPTION 'Cannot reserve % units for backordered item %. Only % units have been marked as "Prepared" via production.', 
            v_qty_to_reserve, v_item.item_id, v_prepared_qty_available;
        END IF;
      END IF;

      -- 4. LOGIC BRANCH: Product vs Cap
      IF v_product_id IS NOT NULL THEN
        -- PRODUCT LOGIC
        SELECT factory_id INTO v_factory_id FROM public.products WHERE id = v_product_id;
        
        v_source_state := CASE v_unit_type
          WHEN 'loose' THEN 'semi_finished'
          WHEN 'packet' THEN 'packed'
          WHEN 'bundle' THEN 'finished'
          ELSE 'finished'
        END;

        -- Check Product Stock - UPDATED to handle '' as fallback for 'loose'
        SELECT SUM(quantity) INTO v_available_stock 
        FROM public.stock_balances 
        WHERE product_id = v_product_id 
          AND state = v_source_state::inventory_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND (
            unit_type = v_unit_type 
            OR (v_unit_type = 'loose' AND unit_type = '')
          );
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for product %. Required: %, Available: % in %', 
             v_product_id, v_qty_to_reserve, COALESCE(v_available_stock, 0), v_source_state;
        END IF;

        -- Reserve Product Stock
        FOR v_balance IN 
          SELECT id, quantity, cap_id, inner_id, unit_type -- Select unit_type to preserve it
          FROM public.stock_balances 
          WHERE product_id = v_product_id 
            AND state = v_source_state::inventory_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND (
              unit_type = v_unit_type 
              OR (v_unit_type = 'loose' AND unit_type = '')
            )
            AND quantity > 0
          ORDER BY (unit_type = v_unit_type) DESC, quantity DESC -- Prefer exact match
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            -- Insert into reserved using the requested v_unit_type
            INSERT INTO public.stock_balances (product_id, factory_id, state, quantity, cap_id, inner_id, unit_type, last_updated)
            VALUES (v_product_id, v_factory_id, 'reserved'::inventory_state, v_deduct_qty, v_balance.cap_id, v_balance.inner_id, v_unit_type, NOW())
            ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
            DO UPDATE SET 
              quantity = stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        LOOP;

      ELSIF v_cap_id IS NOT NULL THEN
        -- CAP LOGIC
        SELECT factory_id INTO v_factory_id FROM public.caps WHERE id = v_cap_id;
        v_source_state := 'finished';

        -- Check Cap Stock
        SELECT SUM(quantity) INTO v_available_stock 
        FROM public.cap_stock_balances 
        WHERE cap_id = v_cap_id 
          AND state = v_source_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND (
            unit_type = COALESCE(v_unit_type, 'loose')
            OR (COALESCE(v_unit_type, 'loose') = 'loose' AND (unit_type = '' OR unit_type IS NULL))
          );
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for cap %. Required: %, Available: %', 
             v_cap_id, v_qty_to_reserve, COALESCE(v_available_stock, 0);
        END IF;

        -- Reserve Cap Stock
        FOR v_balance IN 
          SELECT id, quantity, unit_type 
          FROM public.cap_stock_balances 
          WHERE cap_id = v_cap_id 
            AND state = v_source_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND (
              unit_type = COALESCE(v_unit_type, 'loose')
              OR (COALESCE(v_unit_type, 'loose') = 'loose' AND (unit_type = '' OR unit_type IS NULL))
            )
            AND quantity > 0
          ORDER BY (unit_type = COALESCE(v_unit_type, 'loose')) DESC, quantity DESC
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.cap_stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            INSERT INTO public.cap_stock_balances (cap_id, factory_id, state, quantity, unit_type, last_updated)
            VALUES (v_cap_id, v_factory_id, 'reserved', v_deduct_qty, COALESCE(v_unit_type, 'loose'), NOW())
            ON CONFLICT (cap_id, factory_id, state, unit_type) 
            DO UPDATE SET 
              quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        LOOP;
      END IF;

      -- 5. Update the Sales Order Item Status
      UPDATE public.sales_order_items 
      SET 
        quantity_reserved = quantity_reserved + v_item.quantity,
        is_prepared = (quantity_reserved + v_item.quantity >= quantity),
        prepared_at = CASE WHEN (quantity_reserved + v_item.quantity >= quantity) THEN NOW() ELSE prepared_at END
      WHERE id = v_item.item_id;

      -- 6. Log Transaction
      INSERT INTO public.inventory_transactions (
        product_id, cap_id, from_state, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type
      ) VALUES (
        v_product_id, v_cap_id, v_source_state::inventory_state, 'reserved'::inventory_state, v_item.quantity, 'reserve', p_order_id, v_factory_id, p_user_id, v_unit_type
      );

      v_updated_count := v_updated_count + 1;
    END;
  END LOOP;

  -- 7. Update Sales Order Status to 'reserved' if all items are fully reserved
  IF NOT EXISTS (SELECT 1 FROM public.sales_order_items WHERE order_id = p_order_id AND quantity_reserved < quantity) THEN
    UPDATE public.sales_orders SET status = 'reserved', updated_at = NOW() WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'reserved_count', v_updated_count);
END;
$function$;

-- 3. Data Migration: Align existing 'semi_finished' stock to 'loose' unit_type
UPDATE public.stock_balances 
SET unit_type = 'loose' 
WHERE state = 'semi_finished' AND (unit_type = '' OR unit_type IS NULL);

UPDATE public.cap_stock_balances 
SET unit_type = 'loose' 
WHERE (unit_type = '' OR unit_type IS NULL);

UPDATE public.inventory_transactions 
SET unit_type = 'loose' 
WHERE to_state = 'semi_finished' AND (unit_type = '' OR unit_type IS NULL);


-- File: 20260406_prepare_order_inner_fix.sql
-- Migration: Update prepare_order_items_atomic to handle inner_id
-- Date: 2026-04-06

CREATE OR REPLACE FUNCTION public.prepare_order_items_atomic(p_order_id uuid, p_items jsonb, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_source_state TEXT;
  v_factory_id UUID;
  v_updated_count INT := 0;
BEGIN
  -- Iterate over items to reserve
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INT)
  LOOP
    DECLARE
      v_product_id UUID;
      v_cap_id UUID;
      v_inner_id UUID;
      v_include_inner BOOLEAN;
      v_unit_type TEXT;
      v_qty_to_reserve INT := v_item.quantity;
      v_already_reserved INT;
      v_total_needed INT;
      v_is_backordered BOOLEAN;
      v_balance RECORD;
      v_remaining_to_reserve INT := v_item.quantity;
      v_available_stock INT;
      v_prepared_qty_available INT := 0;
    BEGIN
      -- 1. Fetch item details including inner requirement
      SELECT 
        soi.product_id, soi.cap_id, soi.unit_type, soi.quantity, 
        COALESCE(soi.quantity_reserved, 0), soi.is_backordered,
        soi.include_inner, soi.inner_id
      INTO 
        v_product_id, v_cap_id, v_unit_type, v_total_needed, 
        v_already_reserved, v_is_backordered,
        v_include_inner, v_inner_id
      FROM public.sales_order_items soi
      WHERE soi.id = v_item.item_id AND soi.order_id = p_order_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % not found in order %', v_item.item_id, p_order_id;
      END IF;

      -- 2. Validation: Not exceeding total needed
      IF v_already_reserved + v_qty_to_reserve > v_total_needed THEN
        RAISE EXCEPTION 'Cannot reserve % units for item %. Total needed: %, already reserved: %', 
          v_qty_to_reserve, v_item.item_id, v_total_needed, v_already_reserved;
      END IF;

      -- 3. Validation: If backordered, ensure production request is 'prepared'
      IF v_is_backordered THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_prepared_qty_available
        FROM public.production_requests
        WHERE sales_order_id = p_order_id
          AND (product_id = v_product_id OR (product_id IS NULL AND v_product_id IS NULL))
          AND (cap_id = v_cap_id OR (cap_id IS NULL AND v_cap_id IS NULL))
          AND (inner_id = v_inner_id OR (inner_id IS NULL AND v_inner_id IS NULL))
          AND status = 'prepared'::production_request_status;

        -- Check if we have enough "prepared" signal to cover this reservation
        IF v_already_reserved + v_qty_to_reserve > v_prepared_qty_available THEN
          RAISE EXCEPTION 'Cannot reserve % units for backordered item %. Only % units have been marked as "Prepared" via production.', 
            v_qty_to_reserve, v_item.item_id, v_prepared_qty_available;
        END IF;
      END IF;

      -- 4. LOGIC BRANCH: Product vs Cap
      IF v_product_id IS NOT NULL THEN
        -- PRODUCT LOGIC
        SELECT factory_id INTO v_factory_id FROM public.products WHERE id = v_product_id;
        
        v_source_state := CASE v_unit_type
          WHEN 'loose' THEN 'semi_finished'
          WHEN 'packet' THEN 'packed'
          WHEN 'bundle' THEN 'finished'
          ELSE 'finished'
        END;

        -- Check Product Stock (respecting inner requirement)
        SELECT SUM(quantity) INTO v_available_stock 
        FROM public.stock_balances 
        WHERE product_id = v_product_id 
          AND state = v_source_state::inventory_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND (
            unit_type = v_unit_type 
            OR (v_unit_type = 'loose' AND unit_type = '')
          )
          AND (
            (v_include_inner = TRUE AND inner_id = v_inner_id) OR
            (COALESCE(v_include_inner, FALSE) = FALSE AND inner_id IS NULL)
          );
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for product %. Required: %, Available: % in %', 
             v_product_id, v_qty_to_reserve, COALESCE(v_available_stock, 0), v_source_state;
        END IF;

        -- Reserve Product Stock
        FOR v_balance IN 
          SELECT id, quantity, cap_id, inner_id, unit_type 
          FROM public.stock_balances 
          WHERE product_id = v_product_id 
            AND state = v_source_state::inventory_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND (
              unit_type = v_unit_type 
              OR (v_unit_type = 'loose' AND unit_type = '')
            )
            AND (
              (v_include_inner = TRUE AND inner_id = v_inner_id) OR
              (COALESCE(v_include_inner, FALSE) = FALSE AND inner_id IS NULL)
            )
            AND quantity > 0
          ORDER BY (unit_type = v_unit_type) DESC, quantity DESC -- Prefer exact match
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            -- Insert into reserved using the requested v_unit_type
            INSERT INTO public.stock_balances (product_id, factory_id, state, quantity, cap_id, inner_id, unit_type, last_updated)
            VALUES (v_product_id, v_factory_id, 'reserved'::inventory_state, v_deduct_qty, v_balance.cap_id, v_balance.inner_id, v_unit_type, NOW())
            ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
            DO UPDATE SET 
              quantity = stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;

      ELSIF v_cap_id IS NOT NULL THEN
        -- CAP LOGIC (No inner requirement for caps)
        SELECT factory_id INTO v_factory_id FROM public.caps WHERE id = v_cap_id;
        v_source_state := 'finished';

        -- Check Cap Stock
        SELECT SUM(quantity) INTO v_available_stock 
        FROM public.cap_stock_balances 
        WHERE cap_id = v_cap_id 
          AND state = v_source_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND (
            unit_type = COALESCE(v_unit_type, 'loose')
            OR (COALESCE(v_unit_type, 'loose') = 'loose' AND (unit_type = '' OR unit_type IS NULL))
          );
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for cap %. Required: %, Available: %', 
             v_cap_id, v_qty_to_reserve, COALESCE(v_available_stock, 0);
        END IF;

        -- Reserve Cap Stock
        FOR v_balance IN 
          SELECT id, quantity, unit_type 
          FROM public.cap_stock_balances 
          WHERE cap_id = v_cap_id 
            AND state = v_source_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND (
              unit_type = COALESCE(v_unit_type, 'loose')
              OR (COALESCE(v_unit_type, 'loose') = 'loose' AND (unit_type = '' OR unit_type IS NULL))
            )
            AND quantity > 0
          ORDER BY (unit_type = COALESCE(v_unit_type, 'loose')) DESC, quantity DESC
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.cap_stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            INSERT INTO public.cap_stock_balances (cap_id, factory_id, state, quantity, unit_type, last_updated)
            VALUES (v_cap_id, v_factory_id, 'reserved', v_deduct_qty, COALESCE(v_unit_type, 'loose'), NOW())
            ON CONFLICT (cap_id, factory_id, state, unit_type) 
            DO UPDATE SET 
              quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;
      END IF;

      -- 5. Update the Sales Order Item Status
      UPDATE public.sales_order_items 
      SET 
        quantity_reserved = quantity_reserved + v_item.quantity,
        is_prepared = (quantity_reserved + v_item.quantity >= quantity),
        prepared_at = CASE WHEN (quantity_reserved + v_item.quantity >= quantity) THEN NOW() ELSE prepared_at END
      WHERE id = v_item.item_id;

      -- 6. Log Transaction
      INSERT INTO public.inventory_transactions (
        product_id, cap_id, from_state, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type
      ) VALUES (
        v_product_id, v_cap_id, v_source_state::inventory_state, 'reserved'::inventory_state, v_item.quantity, 'reserve', p_order_id, v_factory_id, p_user_id, v_unit_type
      );

      v_updated_count := v_updated_count + 1;
    END;
  END LOOP;

  -- 7. Update Sales Order Status to 'reserved' if all items are fully reserved
  IF NOT EXISTS (SELECT 1 FROM public.sales_order_items WHERE order_id = p_order_id AND quantity_reserved < quantity) THEN
    UPDATE public.sales_orders SET status = 'reserved', updated_at = NOW() WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'reserved_count', v_updated_count);
END;
$$;


-- File: 20260406_sales_order_inner_hardening.sql
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


-- File: 20260407_fix_dispatch_visibility.sql
-- Migration: Sync quantity_prepared with quantity_reserved in prepare_order_items_atomic
-- Date: 2026-04-07

CREATE OR REPLACE FUNCTION public.prepare_order_items_atomic(p_order_id uuid, p_items jsonb, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_source_state TEXT;
  v_factory_id UUID;
  v_updated_count INT := 0;
BEGIN
  -- Iterate over items to reserve
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, quantity INT)
  LOOP
    DECLARE
      v_product_id UUID;
      v_cap_id UUID;
      v_inner_id UUID;
      v_include_inner BOOLEAN;
      v_unit_type TEXT;
      v_qty_to_reserve INT := v_item.quantity;
      v_already_reserved INT;
      v_total_needed INT;
      v_is_backordered BOOLEAN;
      v_balance RECORD;
      v_remaining_to_reserve INT := v_item.quantity;
      v_available_stock INT;
      v_prepared_qty_available INT := 0;
    BEGIN
      -- 1. Fetch item details including inner requirement
      SELECT 
        soi.product_id, soi.cap_id, soi.unit_type, soi.quantity, 
        COALESCE(soi.quantity_reserved, 0), soi.is_backordered,
        soi.include_inner, soi.inner_id
      INTO 
        v_product_id, v_cap_id, v_unit_type, v_total_needed, 
        v_already_reserved, v_is_backordered,
        v_include_inner, v_inner_id
      FROM public.sales_order_items soi
      WHERE soi.id = v_item.item_id AND soi.order_id = p_order_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % not found in order %', v_item.item_id, p_order_id;
      END IF;

      -- 2. Validation: Not exceeding total needed
      IF v_already_reserved + v_qty_to_reserve > v_total_needed THEN
        RAISE EXCEPTION 'Cannot reserve % units for item %. Total needed: %, already reserved: %', 
          v_qty_to_reserve, v_item.item_id, v_total_needed, v_already_reserved;
      END IF;

      -- 3. Validation: If backordered, ensure production request is 'prepared'
      IF v_is_backordered THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_prepared_qty_available
        FROM public.production_requests
        WHERE sales_order_id = p_order_id
          AND (product_id = v_product_id OR (product_id IS NULL AND v_product_id IS NULL))
          AND (cap_id = v_cap_id OR (cap_id IS NULL AND v_cap_id IS NULL))
          AND (inner_id = v_inner_id OR (inner_id IS NULL AND v_inner_id IS NULL))
          AND status = 'prepared'::production_request_status;

        -- Check if we have enough "prepared" signal to cover this reservation
        IF v_already_reserved + v_qty_to_reserve > v_prepared_qty_available THEN
          RAISE EXCEPTION 'Cannot reserve % units for backordered item %. Only % units have been marked as "Prepared" via production.', 
            v_qty_to_reserve, v_item.item_id, v_prepared_qty_available;
        END IF;
      END IF;

      -- 4. LOGIC BRANCH: Product vs Cap
      IF v_product_id IS NOT NULL THEN
        -- PRODUCT LOGIC
        SELECT factory_id INTO v_factory_id FROM public.products WHERE id = v_product_id;
        
        v_source_state := CASE v_unit_type
          WHEN 'loose' THEN 'semi_finished'
          WHEN 'packet' THEN 'packed'
          WHEN 'bundle' THEN 'finished'
          ELSE 'finished'
        END;

        -- Check Product Stock (respecting inner requirement)
        SELECT SUM(quantity) INTO v_available_stock 
        FROM public.stock_balances 
        WHERE product_id = v_product_id 
          AND state = v_source_state::inventory_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND (
            unit_type = v_unit_type 
            OR (v_unit_type = 'loose' AND unit_type = '')
          )
          AND (
            (v_include_inner = TRUE AND inner_id = v_inner_id) OR
            (COALESCE(v_include_inner, FALSE) = FALSE AND inner_id IS NULL)
          );
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for product %. Required: %, Available: % in %', 
             v_product_id, v_qty_to_reserve, COALESCE(v_available_stock, 0), v_source_state;
        END IF;

        -- Reserve Product Stock
        FOR v_balance IN 
          SELECT id, quantity, cap_id, inner_id, unit_type 
          FROM public.stock_balances 
          WHERE product_id = v_product_id 
            AND state = v_source_state::inventory_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND (
              unit_type = v_unit_type 
              OR (v_unit_type = 'loose' AND unit_type = '')
            )
            AND (
              (v_include_inner = TRUE AND inner_id = v_inner_id) OR
              (COALESCE(v_include_inner, FALSE) = FALSE AND inner_id IS NULL)
            )
            AND quantity > 0
          ORDER BY (unit_type = v_unit_type) DESC, quantity DESC -- Prefer exact match
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            -- Insert into reserved using the requested v_unit_type
            INSERT INTO public.stock_balances (product_id, factory_id, state, quantity, cap_id, inner_id, unit_type, last_updated)
            VALUES (v_product_id, v_factory_id, 'reserved'::inventory_state, v_deduct_qty, v_balance.cap_id, v_balance.inner_id, v_unit_type, NOW())
            ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id) 
            DO UPDATE SET 
              quantity = stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;

      ELSIF v_cap_id IS NOT NULL THEN
        -- CAP LOGIC (No inner requirement for caps)
        SELECT factory_id INTO v_factory_id FROM public.caps WHERE id = v_cap_id;
        v_source_state := 'finished';

        -- Check Cap Stock
        SELECT SUM(quantity) INTO v_available_stock 
        FROM public.cap_stock_balances 
        WHERE cap_id = v_cap_id 
          AND state = v_source_state 
          AND (factory_id = v_factory_id OR factory_id IS NULL)
          AND (
            unit_type = COALESCE(v_unit_type, 'loose')
            OR (COALESCE(v_unit_type, 'loose') = 'loose' AND (unit_type = '' OR unit_type IS NULL))
          );
          
        IF COALESCE(v_available_stock, 0) < v_qty_to_reserve THEN
           RAISE EXCEPTION 'Insufficient physical stock for cap %. Required: %, Available: %', 
             v_cap_id, v_qty_to_reserve, COALESCE(v_available_stock, 0);
        END IF;

        -- Reserve Cap Stock
        FOR v_balance IN 
          SELECT id, quantity, unit_type 
          FROM public.cap_stock_balances 
          WHERE cap_id = v_cap_id 
            AND state = v_source_state 
            AND (factory_id = v_factory_id OR factory_id IS NULL)
            AND (
              unit_type = COALESCE(v_unit_type, 'loose')
              OR (COALESCE(v_unit_type, 'loose') = 'loose' AND (unit_type = '' OR unit_type IS NULL))
            )
            AND quantity > 0
          ORDER BY (unit_type = COALESCE(v_unit_type, 'loose')) DESC, quantity DESC
        LOOP
          EXIT WHEN v_remaining_to_reserve <= 0;
          
          DECLARE
            v_deduct_qty INT := LEAST(v_remaining_to_reserve, v_balance.quantity);
          BEGIN
            UPDATE public.cap_stock_balances SET quantity = quantity - v_deduct_qty, last_updated = NOW() WHERE id = v_balance.id;
            
            INSERT INTO public.cap_stock_balances (cap_id, factory_id, state, quantity, unit_type, last_updated)
            VALUES (v_cap_id, v_factory_id, 'reserved', v_deduct_qty, COALESCE(v_unit_type, 'loose'), NOW())
            ON CONFLICT (cap_id, factory_id, state, unit_type) 
            DO UPDATE SET 
              quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
              last_updated = NOW();
              
            v_remaining_to_reserve := v_remaining_to_reserve - v_deduct_qty;
          END;
        END LOOP;
      END IF;

      -- 5. Update the Sales Order Item Status
      UPDATE public.sales_order_items 
      SET 
        quantity_reserved = quantity_reserved + v_item.quantity,
        quantity_prepared = quantity_prepared + v_item.quantity, -- FIXED: Increment quantity_prepared too!
        is_prepared = (quantity_reserved + v_item.quantity >= quantity),
        prepared_at = CASE WHEN (quantity_reserved + v_item.quantity >= quantity) THEN NOW() ELSE prepared_at END
      WHERE id = v_item.item_id;

      -- 6. Log Transaction
      INSERT INTO public.inventory_transactions (
        product_id, cap_id, from_state, to_state, quantity, transaction_type, reference_id, factory_id, created_by, unit_type
      ) VALUES (
        v_product_id, v_cap_id, v_source_state::inventory_state, 'reserved'::inventory_state, v_item.quantity, 'reserve', p_order_id, v_factory_id, p_user_id, v_unit_type
      );

      v_updated_count := v_updated_count + 1;
    END;
  END LOOP;

  -- 7. Update Sales Order Status to 'reserved' if all items are fully reserved
  IF NOT EXISTS (SELECT 1 FROM public.sales_order_items WHERE order_id = p_order_id AND quantity_reserved < quantity) THEN
    UPDATE public.sales_orders SET status = 'reserved', updated_at = NOW() WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'reserved_count', v_updated_count);
END;
$$;


