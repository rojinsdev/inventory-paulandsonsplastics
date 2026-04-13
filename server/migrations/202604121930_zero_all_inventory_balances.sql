-- DESTRUCTIVE one-off: set all on-hand inventory quantities to zero.
-- Intended for Production (or any env) only after a DB backup and explicit approval.
-- Does NOT delete product/cap/inner master rows or transaction history.
--
-- Run via Supabase Dashboard → SQL Editor, psql, or Cursor MCP `user-supabase-prod`
-- (`execute_sql`) when that server is connected to the production project.

BEGIN;

UPDATE public.stock_balances SET quantity = 0;

UPDATE public.cap_stock_balances SET quantity = 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inner_stock_balances'
  ) THEN
    UPDATE public.inner_stock_balances SET quantity = 0;
  END IF;
END $$;

UPDATE public.raw_materials SET stock_weight_kg = 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales_order_items'
      AND column_name = 'quantity_reserved'
  ) THEN
    UPDATE public.sales_order_items
    SET quantity_reserved = 0
    WHERE quantity_reserved IS NOT NULL AND quantity_reserved <> 0;
  END IF;
END $$;

-- Optional: bump row timestamps where the column exists (skipped if only legacy names exist).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_balances' AND column_name = 'updated_at'
  ) THEN
    EXECUTE 'UPDATE public.stock_balances SET updated_at = now()';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_balances' AND column_name = 'last_updated'
  ) THEN
    EXECUTE 'UPDATE public.stock_balances SET last_updated = now()';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cap_stock_balances' AND column_name = 'updated_at'
  ) THEN
    EXECUTE 'UPDATE public.cap_stock_balances SET updated_at = now()';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cap_stock_balances' AND column_name = 'last_updated'
  ) THEN
    EXECUTE 'UPDATE public.cap_stock_balances SET last_updated = now()';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inner_stock_balances'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'inner_stock_balances' AND column_name = 'updated_at'
    ) THEN
      EXECUTE 'UPDATE public.inner_stock_balances SET updated_at = now()';
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'inner_stock_balances' AND column_name = 'last_updated'
    ) THEN
      EXECUTE 'UPDATE public.inner_stock_balances SET last_updated = now()';
    END IF;
  END IF;
END $$;

COMMIT;
