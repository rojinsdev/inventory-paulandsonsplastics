-- Migration: Template-Variant Architecture
-- Adds product_templates and cap_templates to handle hierarchical variations.

BEGIN;

-- 1. Create product_templates table
CREATE TABLE IF NOT EXISTS product_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    size TEXT NOT NULL,
    weight_grams NUMERIC(10,2) NOT NULL,
    items_per_packet INTEGER DEFAULT 100,
    packets_per_bundle INTEGER DEFAULT 50,
    factory_id UUID REFERENCES factories(id) NOT NULL,
    status TEXT CHECK (status IN ('active', 'inactive')) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, size, factory_id)
);

-- 2. Create cap_templates table
CREATE TABLE IF NOT EXISTS cap_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    ideal_weight_grams NUMERIC(10,2) NOT NULL,
    factory_id UUID REFERENCES factories(id) NOT NULL,
    status TEXT CHECK (status IN ('active', 'inactive')) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, factory_id)
);

-- 3. Update products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES product_templates(id);

-- 4. Update caps table
ALTER TABLE caps ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES cap_templates(id);

-- 5. Migrate existing data to templates
-- Create base templates from existing products
INSERT INTO product_templates (name, size, weight_grams, items_per_packet, packets_per_bundle, factory_id)
SELECT DISTINCT name, size, weight_grams, items_per_packet, packets_per_bundle, factory_id
FROM products
ON CONFLICT (name, size, factory_id) DO NOTHING;

-- Link products to templates
UPDATE products p
SET template_id = pt.id
FROM product_templates pt
WHERE p.name = pt.name AND p.size = pt.size AND p.factory_id = pt.factory_id;

-- Create cap templates from existing caps
INSERT INTO cap_templates (name, ideal_weight_grams, factory_id)
SELECT DISTINCT name, ideal_weight_grams, factory_id
FROM caps
ON CONFLICT (name, factory_id) DO NOTHING;

-- Link caps to templates
UPDATE caps c
SET template_id = ct.id
FROM cap_templates ct
WHERE c.name = ct.name AND c.factory_id = ct.factory_id;

-- 6. Update stock_balances
ALTER TABLE stock_balances ADD COLUMN IF NOT EXISTS cap_id UUID REFERENCES caps(id);
ALTER TABLE stock_balances DROP CONSTRAINT IF EXISTS stock_balances_product_id_state_factory_key;
ALTER TABLE stock_balances ADD CONSTRAINT stock_balances_product_id_state_factory_cap_key 
    UNIQUE(product_id, state, factory_id, cap_id);

-- 7. Update machine_products
-- We want machines to be mapped to templates.
ALTER TABLE machine_products ADD COLUMN IF NOT EXISTS product_template_id UUID REFERENCES product_templates(id);

-- Migrate existing machine_products mapping
UPDATE machine_products mp
SET product_template_id = p.template_id
FROM products p
WHERE mp.product_id = p.id;

-- Update the unique constraint on machine_products 
ALTER TABLE machine_products DROP CONSTRAINT IF EXISTS machine_products_machine_id_product_id_key;
ALTER TABLE machine_products ADD CONSTRAINT machine_products_machine_id_template_key 
    UNIQUE(machine_id, product_template_id);

COMMIT;
