-- Migration: Add total_produced to inner_production_logs
-- Description: Supports manual unit count entry for inner production
-- Date: 2026-03-23

ALTER TABLE inner_production_logs ADD COLUMN IF NOT EXISTS total_produced INTEGER;
COMMENT ON COLUMN inner_production_logs.total_produced IS 'Manual unit count entered by user. If null, use calculated_quantity.';
