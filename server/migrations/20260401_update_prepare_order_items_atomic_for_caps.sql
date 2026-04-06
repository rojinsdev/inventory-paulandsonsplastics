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
