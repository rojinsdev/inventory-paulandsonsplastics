-- Migration: Allow authenticated users to read stock balances
-- Currently only admins can read via ALL policy.

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'stock_balances' 
        AND policyname = 'Authenticated users can view stock balances'
    ) THEN
        CREATE POLICY "Authenticated users can view stock balances" 
        ON stock_balances 
        FOR SELECT 
        TO authenticated 
        USING (true);
    END IF;
END $$;
