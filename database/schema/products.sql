-- Products Master Table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- e.g., "Bottle"
    sku TEXT UNIQUE, -- Stock Keeping Unit - unique product identifier
    size TEXT NOT NULL, -- e.g., "100ml", "1L"
    color TEXT NOT NULL, -- e.g., "White", "Black", "Milky"
    weight_grams NUMERIC(10,2) NOT NULL, -- Critical for raw material deduction
    selling_price NUMERIC(10,2), -- Optional selling price per item
    items_per_packet INTEGER DEFAULT 100, -- Standard default, can be changed
    packets_per_bundle INTEGER DEFAULT 50, -- Standard default, can be changed
    status TEXT CHECK (status IN ('active', 'inactive')) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN products.weight_grams IS 'Weight in grams, used to deduct from Raw Material stock';

-- Machine <-> Product Mapping (Dies)
-- Defines which machine can make which product and how fast
CREATE TABLE machine_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    cycle_time_seconds NUMERIC NOT NULL, -- e.g., 13.5
    capacity_restriction NUMERIC, -- Optional constraint
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(machine_id, product_id)
);

COMMENT ON COLUMN machine_products.cycle_time_seconds IS 'Used to calculate theoretical daily output (23h / cycle_time)';
