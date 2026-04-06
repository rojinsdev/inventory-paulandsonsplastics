-- Standardize wastage columns across all production log tables
-- 1. Add to cap_production_logs
ALTER TABLE public.cap_production_logs 
ADD COLUMN IF NOT EXISTS weight_wastage_kg numeric DEFAULT 0;

-- 2. Rename in inner_production_logs for consistency
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'inner_production_logs' 
        AND column_name = 'waste_weight_kg'
    ) THEN
        ALTER TABLE public.inner_production_logs 
        RENAME COLUMN waste_weight_kg TO weight_wastage_kg;
    END IF;
END $$;

-- 3. Ensure all are numeric and have defaults
ALTER TABLE public.production_logs 
ALTER COLUMN weight_wastage_kg SET DEFAULT 0;

ALTER TABLE public.cap_production_logs 
ALTER COLUMN weight_wastage_kg SET DEFAULT 0;

ALTER TABLE public.inner_production_logs 
ALTER COLUMN weight_wastage_kg SET DEFAULT 0;
