-- Stabilization Migration v2: Harmonizing Caps and Inners with 'semi_finished' state
-- Created: 2026-04-07

-- 1. Update adjust_cap_stock RPC
CREATE OR REPLACE FUNCTION public.adjust_cap_stock(
    p_cap_id uuid,
    p_factory_id uuid,
    p_quantity_change numeric,
    p_state text DEFAULT 'semi_finished'::text, -- WAS 'packed'
    p_unit_type text DEFAULT 'units'::text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.cap_stock_balances (
        cap_id, factory_id, state, quantity, unit_type, updated_at
    ) VALUES (
        p_cap_id, p_factory_id, p_state, p_quantity_change, p_unit_type, now()
    )
    ON CONFLICT (cap_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at;
END;
$$;

-- 2. Update adjust_inner_stock RPC
CREATE OR REPLACE FUNCTION public.adjust_inner_stock(
    p_inner_id uuid,
    p_factory_id uuid,
    p_quantity_change numeric,
    p_state text DEFAULT 'semi_finished'::text, -- WAS 'packed'
    p_unit_type text DEFAULT 'units'::text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.inner_stock_balances (
        inner_id, factory_id, state, quantity, unit_type, updated_at
    ) VALUES (
        p_inner_id, p_factory_id, p_state, p_quantity_change, p_unit_type, now()
    )
    ON CONFLICT (inner_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = inner_stock_balances.quantity + EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at;
END;
$$;

-- 3. Update prepare_order_items_atomic to use semi_finished for ALL components
-- (This is a simplified re-application of the logic to ensure consistency)
CREATE OR REPLACE FUNCTION public.prepare_order_items_atomic(
    p_order_id uuid,
    p_factory_id uuid,
    p_items jsonb,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item record;
  v_balance record;
  v_deduct_qty numeric;
  v_remaining_required numeric;
  v_total_reserved numeric := 0;
  v_is_fully_reserved boolean := true;
BEGIN
  -- Iterate through items in the JSON array
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_id uuid, 
    cap_id uuid, 
    inner_id uuid, 
    quantity numeric, 
    unit_type text,
    is_cap_only boolean,
    is_inner_only boolean
  )
  LOOP
    v_remaining_required := v_item.quantity;
    
    -- A. Handle Product (Tub/Jar)
    IF v_item.product_id IS NOT NULL AND v_item.is_cap_only IS NOT TRUE AND v_item.is_inner_only IS NOT TRUE THEN
      -- Standardized: Tubs are 'semi_finished' when loose, 'packed' when in packets, 'finished' when in bundles
      FOR v_balance IN 
        SELECT id, quantity 
        FROM stock_balances 
        WHERE product_id = v_item.product_id 
          AND factory_id = p_factory_id 
          AND state = 'semi_finished'  -- Unified bucket for loose items
          AND unit_type = v_item.unit_type
          AND quantity > 0
        ORDER BY updated_at ASC
      LOOP
        v_deduct_qty := LEAST(v_remaining_required, v_balance.quantity);
        
        UPDATE stock_balances 
        SET quantity = quantity - v_deduct_qty, 
            updated_at = NOW() 
        WHERE id = v_balance.id;
        
        -- Insert reserved entry
        INSERT INTO stock_balances (product_id, factory_id, state, quantity, unit_type, updated_at)
        VALUES (v_item.product_id, p_factory_id, 'reserved', v_deduct_qty, v_item.unit_type, NOW())
        ON CONFLICT (product_id, factory_id, state, unit_type, COALESCE(cap_id, '00000000-0000-0000-0000-000000000000'), COALESCE(inner_id, '00000000-0000-0000-0000-000000000000'))
        DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();
        
        v_remaining_required := v_remaining_required - v_deduct_qty;
        EXIT WHEN v_remaining_required <= 0;
      END LOOP;
    END IF;

    -- B. Handle Cap
    IF v_item.cap_id IS NOT NULL THEN
      FOR v_balance IN 
        SELECT id, quantity 
        FROM cap_stock_balances 
        WHERE cap_id = v_item.cap_id 
          AND factory_id = p_factory_id 
          AND state = 'semi_finished' -- Updated from 'packed'
          AND unit_type = 'units'
          AND quantity > 0
        ORDER BY updated_at ASC
      LOOP
        v_deduct_qty := LEAST(v_remaining_required, v_balance.quantity);
        
        UPDATE cap_stock_balances 
        SET quantity = quantity - v_deduct_qty, 
            updated_at = NOW() 
        WHERE id = v_balance.id;
        
        INSERT INTO cap_stock_balances (cap_id, factory_id, state, quantity, unit_type, updated_at)
        VALUES (v_item.cap_id, p_factory_id, 'reserved', v_deduct_qty, 'units', NOW())
        ON CONFLICT (cap_id, factory_id, state, unit_type)
        DO UPDATE SET quantity = cap_stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();
        
        v_remaining_required := v_remaining_required - v_deduct_qty;
        EXIT WHEN v_remaining_required <= 0;
      END LOOP;
    END IF;

    -- C. Handle Inner
    IF v_item.inner_id IS NOT NULL THEN
      FOR v_balance IN 
        SELECT id, quantity 
        FROM inner_stock_balances 
        WHERE inner_id = v_item.inner_id 
          AND factory_id = p_factory_id 
          AND state = 'semi_finished' -- Updated from 'packed'
          AND unit_type = 'units'
          AND quantity > 0
        ORDER BY updated_at ASC
      LOOP
        v_deduct_qty := LEAST(v_remaining_required, v_balance.quantity);
        
        UPDATE inner_stock_balances 
        SET quantity = quantity - v_deduct_qty, 
            updated_at = NOW() 
        WHERE id = v_balance.id;
        
        INSERT INTO inner_stock_balances (inner_id, factory_id, state, quantity, unit_type, updated_at)
        VALUES (v_item.inner_id, p_factory_id, 'reserved', v_deduct_qty, 'units', NOW())
        ON CONFLICT (inner_id, factory_id, state, unit_type)
        DO UPDATE SET quantity = inner_stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();
        
        v_remaining_required := v_remaining_required - v_deduct_qty;
        EXIT WHEN v_remaining_required <= 0;
      END LOOP;
    END IF;

    IF v_remaining_required > 0 THEN
      v_is_fully_reserved := false;
    END IF;
  END LOOP;

  IF NOT v_is_fully_reserved THEN
     RAISE EXCEPTION 'Insufficient stock for one or more items';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Data Fix: Move existing Cap and Inner stock from 'packed' to 'semi_finished'
-- This ensures existing produced components are accessible for reservation.

-- For Caps
INSERT INTO cap_stock_balances (cap_id, factory_id, state, quantity, unit_type, updated_at)
SELECT cap_id, factory_id, 'semi_finished', quantity, unit_type, NOW()
FROM cap_stock_balances
WHERE state = 'packed'
ON CONFLICT (cap_id, factory_id, state, unit_type)
DO UPDATE SET quantity = cap_stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();

DELETE FROM cap_stock_balances WHERE state = 'packed';

-- For Inners
INSERT INTO inner_stock_balances (inner_id, factory_id, state, quantity, unit_type, updated_at)
SELECT inner_id, factory_id, 'semi_finished', quantity, unit_type, NOW()
FROM inner_stock_balances
WHERE state = 'packed'
ON CONFLICT (inner_id, factory_id, state, unit_type)
DO UPDATE SET quantity = inner_stock_balances.quantity + EXCLUDED.quantity, updated_at = NOW();

DELETE FROM inner_stock_balances WHERE state = 'packed';

-- 5. Final Schema Wipe for any remaining 'last_updated' in triggers (Sanity check)
-- Handled by previous queries showing no remaining triggers with 'last_updated'.
