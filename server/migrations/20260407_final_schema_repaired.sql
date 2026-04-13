-- Final Schema Alignment: Ensuring production_logs has updated_at
-- This fixes the error: column "updated_at" of relation "production_logs" does not exist

ALTER TABLE public.production_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Also ensuring all production-related tables have it (safety check)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_transactions' AND column_name = 'updated_at') THEN
        ALTER TABLE public.inventory_transactions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;
