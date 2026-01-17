-- Inventory States
-- Strict state machine: Semi -> Packed -> Finished -> Reserved -> Delivered
CREATE TYPE inventory_state AS ENUM ('semi_finished', 'packed', 'finished', 'reserved', 'delivered');

-- Stock Balances (The Source of Truth)
CREATE TABLE stock_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) NOT NULL,
    state inventory_state NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 0, -- Note: Unit varies by state (Items, Packets, or Bundles)
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, state)
);

-- Raw Materials (Granules)
CREATE TABLE raw_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE, -- e.g., "Standard Plastic Granules"
    stock_weight_kg NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory Transactions (Audit Trail)
CREATE TABLE inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id),
    from_state inventory_state,
    to_state inventory_state,
    quantity NUMERIC NOT NULL,
    reference_id UUID, -- Can link to production_log_id or sales_order_id
    note TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
