-- Migration: Add total_produced to cap_production_logs
-- Description: Supports manual unit count entry for cap production
-- Date: 2026-02-26

ALTER TABLE cap_production_logs ADD COLUMN IF NOT EXISTS total_produced INTEGER;
COMMENT ON COLUMN cap_production_logs.total_produced IS 'Manual unit count entered by user. If null, use calculated_quantity.';
