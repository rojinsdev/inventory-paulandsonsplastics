-- Add enabled column to machine_products
ALTER TABLE machine_products 
ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT true;

-- Comment
COMMENT ON COLUMN machine_products.enabled IS 'Whether this mapping is currently active/allowed';
