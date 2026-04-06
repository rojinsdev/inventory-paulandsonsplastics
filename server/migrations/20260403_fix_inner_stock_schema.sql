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
