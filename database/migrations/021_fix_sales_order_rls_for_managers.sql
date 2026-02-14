-- Migration 021: Fix Sales Order RLS for Production Managers
-- Description: Allows production managers to view sales orders and items for their factory, 
-- and allows them to mark items as prepared.

BEGIN;

-- 1. Update sales_orders RLS
-- Production Managers need to see the header of the order to access items
DROP POLICY IF EXISTS "Production Managers can view sales orders" ON sales_orders;
CREATE POLICY "Production Managers can view sales orders"
    ON sales_orders
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() 
            AND role = 'production_manager' 
            AND active = true
        )
    );

-- 2. Update sales_order_items RLS
-- Production Managers can view items
DROP POLICY IF EXISTS "Production Managers can view sales order items" ON sales_order_items;
CREATE POLICY "Production Managers can view sales order items"
    ON sales_order_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() 
            AND role = 'production_manager' 
            AND active = true
        )
    );

-- Production Managers can update the is_prepared status of items
DROP POLICY IF EXISTS "Production Managers can prepare order items" ON sales_order_items;
CREATE POLICY "Production Managers can prepare order items"
    ON sales_order_items
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() 
            AND role = 'production_manager' 
            AND active = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() 
            AND role = 'production_manager' 
            AND active = true
        )
    );

-- 3. Note: Products table doesn't have RLS enabled, so no changes needed there.
-- If it did, we'd need a policy like "Users can view all products".

COMMIT;
