-- Migration: Add due_date to purchases table
-- Date: 2026-03-25

ALTER TABLE public.purchases ADD COLUMN due_date DATE;

-- Add comment for clarity
COMMENT ON COLUMN public.purchases.due_date IS 'Optional date by which the purchase balance must be settled';
