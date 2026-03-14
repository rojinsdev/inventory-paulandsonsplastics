-- Migration: Template-to-Template Cap Mapping
-- Description: Adds cap_template_id to product_templates and migrates existing product.cap_id mappings
-- Date: 2026-02-22

BEGIN;

-- ============================================================================
-- STEP 1: Add cap_template_id to product_templates
-- ============================================================================

ALTER TABLE product_templates 
ADD COLUMN IF NOT EXISTS cap_template_id UUID REFERENCES cap_templates(id);

-- Add index for mapping lookups
CREATE INDEX IF NOT EXISTS idx_product_templates_cap_template ON product_templates(cap_template_id);

-- ============================================================================
-- STEP 2: Migrate existing mappings from products.cap_id
-- ============================================================================

-- For each product template, find a cap that was mapped to any of its variants,
-- and use that cap's template as the new cap_template_id.
DO $$
BEGIN
    UPDATE product_templates pt
    SET cap_template_id = subquery.cap_template_id
    FROM (
        SELECT DISTINCT ON (p.template_id)
            p.template_id,
            c.template_id as cap_template_id
        FROM products p
        JOIN caps c ON p.cap_id = c.id
        WHERE p.cap_id IS NOT NULL 
          AND p.template_id IS NOT NULL
          AND c.template_id IS NOT NULL
    ) AS subquery
    WHERE pt.id = subquery.template_id
      AND pt.cap_template_id IS NULL;
END $$;

-- ============================================================================
-- STEP 3: Cleanup and Constraints (Optional: Keep cap_id for now but make it optional)
-- ============================================================================

COMMENT ON COLUMN product_templates.cap_template_id IS 'Link to the cap template used for all variants of this product';
COMMENT ON COLUMN products.cap_id IS 'DEPRECATED: Use product_templates.cap_template_id for mapping instead';

-- ============================================================================
-- STEP 4: Migration complete
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 023_template_cap_mapping completed successfully';
    RAISE NOTICE 'product_templates: Added cap_template_id and migrated existing mappings';
END $$;

COMMIT;
