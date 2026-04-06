-- Migration: Add downtime columns to cap and inner production logs
-- Date: 2026-03-24

ALTER TABLE cap_production_logs ADD COLUMN IF NOT EXISTS downtime_minutes INTEGER DEFAULT 0;
ALTER TABLE cap_production_logs ADD COLUMN IF NOT EXISTS downtime_reason TEXT;

ALTER TABLE inner_production_logs ADD COLUMN IF NOT EXISTS downtime_minutes INTEGER DEFAULT 0;
ALTER TABLE inner_production_logs ADD COLUMN IF NOT EXISTS downtime_reason TEXT;

-- Update analytics to handle these
COMMENT ON COLUMN cap_production_logs.downtime_minutes IS 'Calculated downtime in minutes for the production session';
COMMENT ON COLUMN cap_production_logs.downtime_reason IS 'Reason for downtime, required if downtime > 30 minutes';

COMMENT ON COLUMN inner_production_logs.downtime_minutes IS 'Calculated downtime in minutes for the production session';
COMMENT ON COLUMN inner_production_logs.downtime_reason IS 'Reason for downtime, required if downtime > 30 minutes';
