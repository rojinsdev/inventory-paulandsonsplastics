-- Migration 051: Fix Remaining RLS Recursion
-- Description: Replaces recursive RLS policy checks with SECURITY DEFINER functions for the remaining identified tables.

-- 1. Audit Logs
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
    FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 2. Inventory Transactions
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.inventory_transactions;
CREATE POLICY "Admins can view all transactions" ON public.inventory_transactions
    FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authorized roles can log transactions" ON public.inventory_transactions;
CREATE POLICY "Authorized roles can log transactions" ON public.inventory_transactions
    FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));

-- 3. Production Logs
DROP POLICY IF EXISTS "Production Managers can view production logs" ON public.production_logs;
CREATE POLICY "Production Managers can view production logs" ON public.production_logs
    FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all production logs" ON public.production_logs;
CREATE POLICY "Admins can view all production logs" ON public.production_logs
    FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Production Managers can create production logs" ON public.production_logs;
CREATE POLICY "Production Managers can create production logs" ON public.production_logs
    FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));

-- 4. Sales Order Items
DROP POLICY IF EXISTS "Admins can manage sales order items" ON public.sales_order_items;
CREATE POLICY "Admins can manage sales order items" ON public.sales_order_items
    FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- 5. Sales Orders
DROP POLICY IF EXISTS "Admins can manage sales orders" ON public.sales_orders;
CREATE POLICY "Admins can manage sales orders" ON public.sales_orders
    FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- 6. Stock Balances
DROP POLICY IF EXISTS "Admins can manage all stock" ON public.stock_balances;
CREATE POLICY "Admins can manage all stock" ON public.stock_balances
    FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Production Managers can update inventory" ON public.stock_balances;
CREATE POLICY "Production Managers can update inventory" ON public.stock_balances
    FOR UPDATE TO authenticated USING (public.is_manager(auth.uid()));

-- 7. System Settings
DROP POLICY IF EXISTS "Admins can manage settings" ON public.system_settings;
CREATE POLICY "Admins can manage settings" ON public.system_settings
    FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Production managers can view settings" ON public.system_settings;
CREATE POLICY "Production managers can view settings" ON public.system_settings
    FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));
