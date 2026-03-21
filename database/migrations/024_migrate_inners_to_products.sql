-- Migration: Migrate inners from caps to products
-- Description: Moves inner mappings from caps to products and updates stock balances and RPCs to track inners optionally.

BEGIN;

-- 1. Add inner mappings to products and product_templates
ALTER TABLE product_templates ADD COLUMN IF NOT EXISTS inner_template_id UUID REFERENCES inner_templates(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS inner_id UUID REFERENCES inners(id);

-- 2. Add inner tracking to stock_balances and inventory_transactions
ALTER TABLE stock_balances ADD COLUMN IF NOT EXISTS inner_id UUID REFERENCES inners(id);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS inner_id UUID REFERENCES inners(id);

-- 3. Update Unique Constraint on stock_balances
-- Drop the existing constraint (from migration 012/user updates)
ALTER TABLE stock_balances DROP CONSTRAINT IF EXISTS unique_stock_balance;
-- Add the new constraint including inner_id
-- We use NULLS NOT DISTINCT because cap_id and inner_id can be null, and we need unique rows for null values too.
ALTER TABLE stock_balances ADD CONSTRAINT unique_stock_balance UNIQUE NULLS NOT DISTINCT (product_id, state, factory_id, cap_id, inner_id);

-- 4. Drop inner mappings from caps and cap_templates
ALTER TABLE cap_templates DROP COLUMN IF EXISTS inner_template_id CASCADE;
ALTER TABLE caps DROP COLUMN IF EXISTS inner_id CASCADE;

-- 5. Update adjust_stock RPC
CREATE OR REPLACE FUNCTION adjust_stock(
  p_product_id UUID,
  p_factory_id UUID,
  p_state TEXT,
  p_quantity INTEGER,
  p_transaction_type TEXT,
  p_reference_id UUID,
  p_reference_type TEXT,
  p_user_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_cap_id UUID DEFAULT NULL,
  p_inner_id UUID DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id UUID;
  v_result jsonb;
BEGIN
  -- Validate state
  IF p_state NOT IN ('raw', 'semi_finished', 'finished', 'packed') THEN
    RAISE EXCEPTION 'Invalid stock state: %', p_state;
  END IF;

  -- Upsert stock balance
  INSERT INTO stock_balances (
    product_id, factory_id, state, quantity, cap_id, inner_id
  )
  VALUES (
    p_product_id, p_factory_id, p_state, p_quantity, p_cap_id, p_inner_id
  )
  ON CONFLICT ON CONSTRAINT unique_stock_balance
  DO UPDATE SET
    quantity = stock_balances.quantity + EXCLUDED.quantity,
    updated_at = NOW();

  -- Record transaction
  INSERT INTO inventory_transactions (
    product_id, factory_id, state, quantity, type,
    reference_id, reference_type, created_by, notes, cap_id, inner_id
  )
  VALUES (
    p_product_id, p_factory_id, p_state, p_quantity, p_transaction_type,
    p_reference_id, p_reference_type, p_user_id, p_notes, p_cap_id, p_inner_id
  )
  RETURNING id INTO v_transaction_id;

  SELECT jsonb_build_object(
    'transaction_id', v_transaction_id,
    'status', 'success'
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMIT;
