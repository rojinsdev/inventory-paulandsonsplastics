-- Migration: add_cap_id_to_inventory_transactions
-- Created: 2026-03-29
-- Description: Adds cap_id column and foreign key to inventory_transactions for accurate audit logging.

ALTER TABLE public.inventory_transactions 
ADD COLUMN cap_id UUID REFERENCES public.caps(id);

-- Add index for performance
CREATE INDEX idx_inventory_transactions_cap ON public.inventory_transactions(cap_id);
