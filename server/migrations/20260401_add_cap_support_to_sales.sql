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
