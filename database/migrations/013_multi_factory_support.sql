-- Migration: Multi-Factory Support
-- This migration adds factory support to the entire system
-- WARNING: This will assign all existing data to a default "Main" factory

BEGIN;

-- ============================================================================
-- STEP 1: Create Factories Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS factories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    location TEXT,
    machine_count INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factories_code ON factories(code);
CREATE INDEX IF NOT EXISTS idx_factories_active ON factories(active);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_factories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_factories_updated_at
    BEFORE UPDATE ON factories
    FOR EACH ROW
    EXECUTE FUNCTION update_factories_updated_at();

COMMENT ON TABLE factories IS 'Master list of factory locations';

-- ============================================================================
-- STEP 2: Insert Default Factories
-- ============================================================================

-- Insert Main Factory (for existing data)
INSERT INTO factories (name, code, location, machine_count, active)
VALUES ('Main Factory', 'MAIN', 'Main Location', 8, true)
ON CONFLICT (code) DO NOTHING;

-- Insert Pollanson's Factory
INSERT INTO factories (name, code, location, machine_count, active)
VALUES ('Pollanson''s', 'POLLANSON', 'Pollanson Location', 4, true)
ON CONFLICT (code) DO NOTHING;

-- Store factory IDs for later use
DO $$
DECLARE
    main_factory_id UUID;
BEGIN
    SELECT id INTO main_factory_id FROM factories WHERE code = 'MAIN';
    
    -- Store in a temporary table for use in subsequent steps
    CREATE TEMP TABLE IF NOT EXISTS temp_factory_ids (
        factory_code TEXT PRIMARY KEY,
        factory_id UUID
    );
    
    INSERT INTO temp_factory_ids (factory_code, factory_id)
    SELECT code, id FROM factories
    ON CONFLICT (factory_code) DO UPDATE SET factory_id = EXCLUDED.factory_id;
END $$;

-- ============================================================================
-- STEP 3: Add factory_id to machines table
-- ============================================================================

-- Add column (nullable first)
ALTER TABLE machines ADD COLUMN IF NOT EXISTS factory_id UUID REFERENCES factories(id);

-- Assign all existing machines to Main factory
UPDATE machines 
SET factory_id = (SELECT factory_id FROM temp_factory_ids WHERE factory_code = 'MAIN')
WHERE factory_id IS NULL;

-- Make it NOT NULL
ALTER TABLE machines ALTER COLUMN factory_id SET NOT NULL;

-- Add index
CREATE INDEX IF NOT EXISTS idx_machines_factory ON machines(factory_id);

-- ============================================================================
-- STEP 4: Add factory_id to products table
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS factory_id UUID REFERENCES factories(id);

UPDATE products 
SET factory_id = (SELECT factory_id FROM temp_factory_ids WHERE factory_code = 'MAIN')
WHERE factory_id IS NULL;

ALTER TABLE products ALTER COLUMN factory_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_factory ON products(factory_id);

-- ============================================================================
-- STEP 5: Add factory_id to production_logs table
-- ============================================================================

ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS factory_id UUID REFERENCES factories(id);

UPDATE production_logs 
SET factory_id = (SELECT factory_id FROM temp_factory_ids WHERE factory_code = 'MAIN')
WHERE factory_id IS NULL;

ALTER TABLE production_logs ALTER COLUMN factory_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_production_logs_factory ON production_logs(factory_id);

-- ============================================================================
-- STEP 6: Add factory_id to stock_balances table
-- ============================================================================

ALTER TABLE stock_balances ADD COLUMN IF NOT EXISTS factory_id UUID REFERENCES factories(id);

UPDATE stock_balances 
SET factory_id = (SELECT factory_id FROM temp_factory_ids WHERE factory_code = 'MAIN')
WHERE factory_id IS NULL;

ALTER TABLE stock_balances ALTER COLUMN factory_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_balances_factory ON stock_balances(factory_id);

-- Update unique constraint to include factory_id
ALTER TABLE stock_balances DROP CONSTRAINT IF EXISTS stock_balances_product_id_state_key;
ALTER TABLE stock_balances ADD CONSTRAINT stock_balances_product_id_state_factory_key 
    UNIQUE(product_id, state, factory_id);

-- ============================================================================
-- STEP 7: Add factory_id to raw_materials table
-- ============================================================================

ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS factory_id UUID REFERENCES factories(id);

UPDATE raw_materials 
SET factory_id = (SELECT factory_id FROM temp_factory_ids WHERE factory_code = 'MAIN')
WHERE factory_id IS NULL;

ALTER TABLE raw_materials ALTER COLUMN factory_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raw_materials_factory ON raw_materials(factory_id);

-- Update unique constraint to include factory_id
ALTER TABLE raw_materials DROP CONSTRAINT IF EXISTS raw_materials_name_key;
ALTER TABLE raw_materials ADD CONSTRAINT raw_materials_name_factory_key 
    UNIQUE(name, factory_id);

-- ============================================================================
-- STEP 8: Add factory_id to user_profiles table
-- ============================================================================

-- Add factory_id column (nullable - admins have no factory assignment)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS factory_id UUID REFERENCES factories(id);

-- Production managers will be assigned to Main factory by default
-- Admins keep NULL factory_id (access to all factories)
UPDATE user_profiles 
SET factory_id = (SELECT factory_id FROM temp_factory_ids WHERE factory_code = 'MAIN')
WHERE role = 'production_manager' AND factory_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_factory ON user_profiles(factory_id);

COMMENT ON COLUMN user_profiles.factory_id IS 'NULL for admin (access all factories), specific UUID for production_manager';

-- ============================================================================
-- STEP 9: Update RLS Policies
-- ============================================================================

-- Drop existing policies that need to be updated
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON user_profiles;

-- Recreate policies with factory awareness
CREATE POLICY "Users can view own profile"
    ON user_profiles
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
    ON user_profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can manage profiles"
    ON user_profiles
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================================
-- STEP 10: Create Initial Raw Materials for Pollanson Factory
-- ============================================================================

-- Create a default raw material entry for Pollanson's factory
INSERT INTO raw_materials (name, stock_weight_kg, factory_id)
SELECT 
    'Standard Plastic Granules',
    0,
    (SELECT factory_id FROM temp_factory_ids WHERE factory_code = 'POLLANSON')
WHERE NOT EXISTS (
    SELECT 1 FROM raw_materials 
    WHERE name = 'Standard Plastic Granules' 
    AND factory_id = (SELECT factory_id FROM temp_factory_ids WHERE factory_code = 'POLLANSON')
);

-- ============================================================================
-- STEP 11: Cleanup
-- ============================================================================

DROP TABLE IF EXISTS temp_factory_ids;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Uncomment these to verify the migration
-- SELECT * FROM factories ORDER BY created_at;
-- SELECT COUNT(*), factory_id FROM machines GROUP BY factory_id;
-- SELECT COUNT(*), factory_id FROM products GROUP BY factory_id;
-- SELECT COUNT(*), factory_id FROM production_logs GROUP BY factory_id;
-- SELECT COUNT(*), factory_id FROM stock_balances GROUP BY factory_id;
-- SELECT COUNT(*), factory_id FROM raw_materials GROUP BY factory_id;
-- SELECT role, factory_id, COUNT(*) FROM user_profiles GROUP BY role, factory_id;

COMMIT;
