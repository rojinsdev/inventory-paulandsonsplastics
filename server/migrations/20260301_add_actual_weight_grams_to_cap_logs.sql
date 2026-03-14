-- Migration: Add actual metrics to cap_production_logs
-- Created: 2026-03-01
-- Purpose: Support recording of measured weight and cycle time for caps

ALTER TABLE cap_production_logs 
ADD COLUMN IF NOT EXISTS actual_weight_grams NUMERIC,
ADD COLUMN IF NOT EXISTS actual_cycle_time_seconds INTEGER;

-- Add helpful comments
COMMENT ON COLUMN cap_production_logs.actual_weight_grams IS 'The measured weight per unit in grams for this production session';
COMMENT ON COLUMN cap_production_logs.actual_cycle_time_seconds IS 'The actual cycle time in seconds recorded from the machine';

-- Force schema cache reload (Critical for PostgREST to see the new columns)
NOTIFY pgrst, 'reload schema';
