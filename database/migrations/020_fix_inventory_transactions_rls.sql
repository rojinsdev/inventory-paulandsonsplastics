-- Migration 020: Fix Inventory Transactions RLS
-- Description: Allows admins to log (insert) transactions, enabling them to create sales orders which trigger stock reservations.

-- Update INSERT policy to include 'admin' role
DROP POLICY IF EXISTS "Production Managers can log transactions" ON inventory_transactions;

CREATE POLICY "Authorized roles can log transactions"
    ON inventory_transactions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() 
            AND role IN ('admin', 'production_manager') 
            AND active = true
        )
    );

-- Ensure Admins can also SELECT (should already be covered but for completeness)
DROP POLICY IF EXISTS "Admins can view all transactions" ON inventory_transactions;
CREATE POLICY "Admins can view all transactions"
    ON inventory_transactions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin' AND active = true
        )
    );
