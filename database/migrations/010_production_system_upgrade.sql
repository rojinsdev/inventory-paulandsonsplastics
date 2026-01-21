-- Migration: Production System Upgrade - Session-Based Logging
-- Description: Adds session-based tracking, cycle time analysis, and cap production support
-- Date: 2026-01-21

-- ============================================
-- 1. MODIFY production_logs table
-- ============================================

-- Remove unique constraint (allow multiple entries per day for die changes)
ALTER TABLE production_logs DROP CONSTRAINT IF EXISTS production_logs_machine_id_product_id_date_key;

-- Add new columns for session-based tracking
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS shift_number INTEGER CHECK (shift_number IN (1, 2));
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS end_time TIME;

-- Add production metrics
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS total_produced INTEGER;
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS damaged_count INTEGER DEFAULT 0;

-- Add cycle time and weight tracking
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS actual_cycle_time_seconds NUMERIC;
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS actual_weight_grams NUMERIC;

-- Add downtime tracking
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS downtime_minutes INTEGER;
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS downtime_reason TEXT;

-- Add calculated fields for analytics
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS units_lost_to_cycle INTEGER;
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS weight_wastage_kg NUMERIC;
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN DEFAULT FALSE;

-- Add total_weight_kg for cap production (weight-based counting)
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS total_weight_kg NUMERIC;

-- Update comments
COMMENT ON COLUMN production_logs.shift_number IS '1 = 8AM-8PM (Day), 2 = 8PM-8AM (Night)';
COMMENT ON COLUMN production_logs.actual_cycle_time_seconds IS 'Observed cycle time from machine display';
COMMENT ON COLUMN production_logs.actual_weight_grams IS 'Measured weight per unit during production';
COMMENT ON COLUMN production_logs.units_lost_to_cycle IS 'Calculated: Units lost due to slower cycle time';
COMMENT ON COLUMN production_logs.flagged_for_review IS 'Auto-flagged if actual_cycle_time > ideal * 1.05';
COMMENT ON COLUMN production_logs.total_weight_kg IS 'For weight-based products (caps): total weight produced';
COMMENT ON COLUMN production_logs.downtime_minutes IS 'Calculated: Shift duration - actual production time';
COMMENT ON COLUMN production_logs.downtime_reason IS 'Required if downtime > 30 mins: Die Change, Power Cut, Maintenance, Other';

-- ============================================
-- 2. MODIFY products table (Cap Support)
-- ============================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS counting_method TEXT 
  CHECK (counting_method IN ('unit_count', 'weight_based')) 
  DEFAULT 'unit_count';

COMMENT ON COLUMN products.counting_method IS 'unit_count = normal, weight_based = caps (count by weight)';

-- ============================================
-- 3. MODIFY machine_products table
-- ============================================

-- Rename cycle_time_seconds to ideal_cycle_time_seconds for clarity
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'machine_products' 
        AND column_name = 'cycle_time_seconds'
    ) THEN
        ALTER TABLE machine_products RENAME COLUMN cycle_time_seconds TO ideal_cycle_time_seconds;
    END IF;
END $$;

COMMENT ON COLUMN machine_products.ideal_cycle_time_seconds IS 'Gold Standard speed set by Admin';

-- ============================================
-- 4. Create indexes for analytics queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_production_logs_date_shift ON production_logs(date, shift_number);
CREATE INDEX IF NOT EXISTS idx_production_logs_flagged ON production_logs(flagged_for_review) WHERE flagged_for_review = TRUE;
CREATE INDEX IF NOT EXISTS idx_production_logs_machine_date ON production_logs(machine_id, date);

-- ============================================
-- 5. Update existing data (backward compatibility)
-- ============================================

-- Set default shift_number for existing records (assume Shift 1)
UPDATE production_logs 
SET shift_number = 1 
WHERE shift_number IS NULL;

-- Set default counting_method for existing products
UPDATE products 
SET counting_method = 'unit_count' 
WHERE counting_method IS NULL;

-- ============================================
-- 6. Migration complete
-- ============================================

-- Verify migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 010_production_system_upgrade completed successfully';
    RAISE NOTICE 'production_logs: Added session tracking, cycle time analysis, downtime tracking';
    RAISE NOTICE 'products: Added counting_method for cap support';
    RAISE NOTICE 'machine_products: Renamed cycle_time_seconds to ideal_cycle_time_seconds';
END $$;
