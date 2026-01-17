-- Update existing tables to reference user_profiles instead of auth.users
-- This ensures all user references go through our profiles table

-- Production logs: created_by should reference user_profiles
ALTER TABLE production_logs
    DROP CONSTRAINT IF EXISTS production_logs_created_by_fkey,
    ADD CONSTRAINT production_logs_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES user_profiles(id)
        ON DELETE SET NULL;

-- Sales orders: created_by should reference user_profiles
ALTER TABLE sales_orders
    DROP CONSTRAINT IF EXISTS sales_orders_created_by_fkey,
    ADD CONSTRAINT sales_orders_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES user_profiles(id)
        ON DELETE SET NULL;

-- Add RLS to production_logs
ALTER TABLE production_logs ENABLE ROW LEVEL SECURITY;

-- Production Managers can insert their own production logs
CREATE POLICY "Production Managers can create production logs"
    ON production_logs
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'production_manager' AND active = true
        )
    );

-- Production Managers can view production logs
CREATE POLICY "Production Managers can view production logs"
    ON production_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'production_manager' AND active = true
        )
    );

-- Admins can view all production logs
CREATE POLICY "Admins can view all production logs"
    ON production_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin' AND active = true
        )
    );

-- Add RLS to sales_orders
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;

-- Only Admins can manage sales orders
CREATE POLICY "Admins can manage sales orders"
    ON sales_orders
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin' AND active = true
        )
    );

-- Add RLS to sales_order_items
ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;

-- Admins can manage sales order items
CREATE POLICY "Admins can manage sales order items"
    ON sales_order_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin' AND active = true
        )
    );

-- Add RLS to inventory state transitions (pack/bundle)
ALTER TABLE stock_balances ENABLE ROW LEVEL SECURITY;

-- Production Managers can update stock during pack/bundle
CREATE POLICY "Production Managers can update inventory"
    ON stock_balances
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'production_manager' AND active = true
        )
    );

-- Admins can view and manage all stock
CREATE POLICY "Admins can manage all stock"
    ON stock_balances
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin' AND active = true
        )
    );

-- Add RLS to inventory transactions
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

-- Production Managers can create transactions
CREATE POLICY "Production Managers can log transactions"
    ON inventory_transactions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'production_manager' AND active = true
        )
    );

-- Admins can view all transactions
CREATE POLICY "Admins can view all transactions"
    ON inventory_transactions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin' AND active = true
        )
    );
