-- Add created_by column to supplier_payments
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'supplier_payments' AND column_name = 'created_by') THEN
        ALTER TABLE public.supplier_payments ADD COLUMN created_by UUID REFERENCES auth.users(id);
    END IF;
END $$;
