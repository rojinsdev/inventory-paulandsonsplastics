-- Migration: Add Raw Material Mapping to Products
-- Description: Links products to specific raw materials for automatic deduction during production
-- Date: 2026-02-02

BEGIN;

-- ============================================================================
-- STEP 1: Add raw_material_id column to products table
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS raw_material_id UUID REFERENCES raw_materials(id);

-- Add index for query performance
CREATE INDEX IF NOT EXISTS idx_products_raw_material ON products(raw_material_id);

-- ============================================================================
-- STEP 2: Add trigger to ensure product and raw material are in same factory
-- ============================================================================

-- Create trigger function to validate factory consistency
CREATE OR REPLACE FUNCTION validate_product_raw_material_factory()
RETURNS TRIGGER AS $$
BEGIN
    -- If raw_material_id is NULL, allow it
    IF NEW.raw_material_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Check if raw material belongs to the same factory
    IF NOT EXISTS (
        SELECT 1 
        FROM raw_materials 
        WHERE id = NEW.raw_material_id 
        AND factory_id = NEW.factory_id
    ) THEN
        RAISE EXCEPTION 'Raw material must belong to the same factory as the product';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on INSERT and UPDATE
DROP TRIGGER IF EXISTS check_product_raw_material_factory ON products;
CREATE TRIGGER check_product_raw_material_factory
    BEFORE INSERT OR UPDATE OF raw_material_id, factory_id ON products
    FOR EACH ROW
    EXECUTE FUNCTION validate_product_raw_material_factory();

-- ============================================================================
-- STEP 3: Comments for documentation
-- ============================================================================

COMMENT ON COLUMN products.raw_material_id IS 'Raw material used for this product. Must belong to the same factory.';

-- ============================================================================
-- STEP 4: Migration complete
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 015_add_product_raw_material_mapping completed successfully';
    RAISE NOTICE 'products: Added raw_material_id column with factory constraint';
    RAISE NOTICE 'NOTE: Existing products have NULL raw_material_id and must be assigned manually';
END $$;

COMMIT;
