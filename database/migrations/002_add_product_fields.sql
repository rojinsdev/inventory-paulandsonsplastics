-- Migration: Add sku and selling_price fields to products table
-- This is a safe migration - adds nullable columns

-- Add SKU column (unique identifier)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS sku TEXT UNIQUE;

-- Add selling_price column (optional pricing)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10,2);

-- Add comments for clarity
COMMENT ON COLUMN products.sku IS 'Stock Keeping Unit - unique product identifier';
COMMENT ON COLUMN products.selling_price IS 'Selling price per item in INR';

-- Optional: Auto-generate SKUs for existing products if needed
-- UPDATE products 
-- SET sku = CONCAT(
--     UPPER(SUBSTRING(name, 1, 3)), '-',
--     size, '-',
--     UPPER(SUBSTRING(color, 1, 3))
-- )
-- WHERE sku IS NULL;
