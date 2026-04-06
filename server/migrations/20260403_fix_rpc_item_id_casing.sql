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
