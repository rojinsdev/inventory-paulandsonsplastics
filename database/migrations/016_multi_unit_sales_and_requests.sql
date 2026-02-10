-- Migration 016: Multi-Unit Sales, Smart Queue, and Notifications
-- Description: Adds support for Bundle/Packet/Loose sales, backorder tracking, and a production request/notification system.

-- 1. Create Status Enum for Production Requests
DO $$ BEGIN
    CREATE TYPE production_request_status AS ENUM ('pending', 'in_production', 'ready', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Enhance Sales Order Items for Multi-Unit Support
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS unit_type text DEFAULT 'bundle';
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS quantity integer;
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS is_backordered boolean DEFAULT false;

-- Migrate legacy data: Ensure 'quantity' reflects 'quantity_bundles'
UPDATE sales_order_items SET quantity = quantity_bundles WHERE quantity IS NULL;

-- 3. Create Production Requests Table (Demand Signaling)
CREATE TABLE IF NOT EXISTS production_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid REFERENCES products(id) ON DELETE CASCADE,
    factory_id uuid REFERENCES factories(id) ON DELETE CASCADE,
    quantity integer NOT NULL,
    unit_type text NOT NULL, -- bundle, packet, or loose
    sales_order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL,
    status production_request_status DEFAULT 'pending',
    note text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. Create Notifications Table for App Integration
CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
    title text NOT NULL,
    message text NOT NULL,
    type text NOT NULL, -- e.g., 'production_request', 'backorder_fulfillment', 'inventory_alert'
    is_read boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- 5. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_prod_req_product ON production_requests(product_id);
CREATE INDEX IF NOT EXISTS idx_prod_req_factory ON production_requests(factory_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_items_backordered ON sales_order_items(is_backordered) WHERE is_backordered = true;
