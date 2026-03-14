-- Migration: Fix Cap Template and Cap Schema
-- Description: Adds raw_material_id and ideal_cycle_time_seconds to cap_templates and caps
-- Date: 2026-02-28

BEGIN;

-- 1. Add columns to cap_templates
ALTER TABLE cap_templates ADD COLUMN IF NOT EXISTS raw_material_id UUID REFERENCES raw_materials(id);
ALTER TABLE cap_templates ADD COLUMN IF NOT EXISTS ideal_cycle_time_seconds NUMERIC(10,2) DEFAULT 0.0;

-- 2. Add columns to caps (variants)
ALTER TABLE caps ADD COLUMN IF NOT EXISTS raw_material_id UUID REFERENCES raw_materials(id);
ALTER TABLE caps ADD COLUMN IF NOT EXISTS ideal_cycle_time_seconds NUMERIC(10,2) DEFAULT 0.0;

-- 3. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_cap_templates_raw_material ON cap_templates(raw_material_id);
CREATE INDEX IF NOT EXISTS idx_caps_raw_material ON caps(raw_material_id);

-- 4. Comments
COMMENT ON COLUMN cap_templates.raw_material_id IS 'Default raw material for this cap template';
COMMENT ON COLUMN cap_templates.ideal_cycle_time_seconds IS 'Ideal machine cycle time for this cap template';
COMMENT ON COLUMN caps.raw_material_id IS 'Specific raw material for this cap variant';
COMMENT ON COLUMN caps.ideal_cycle_time_seconds IS 'Specific ideal cycle time for this cap variant';

COMMIT;
