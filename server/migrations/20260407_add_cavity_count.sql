-- Migration: Add cavity_count to mapping and template tables for multi-cavity production support
-- Created At: 2026-04-07

-- 1. Add cavity_count to machine_cap_templates
ALTER TABLE public.machine_cap_templates 
ADD COLUMN IF NOT EXISTS cavity_count INTEGER DEFAULT 1 CHECK (cavity_count > 0);

COMMENT ON COLUMN public.machine_cap_templates.cavity_count IS 'Number of cavities in the mold for this cap on this machine';

-- 2. Add cavity_count to machine_products (Tubs)
ALTER TABLE public.machine_products 
ADD COLUMN IF NOT EXISTS cavity_count INTEGER DEFAULT 1 CHECK (cavity_count > 0);

COMMENT ON COLUMN public.machine_products.cavity_count IS 'Number of cavities in the mold for this product on this machine';

-- 3. Add cavity_count to inner_templates
ALTER TABLE public.inner_templates 
ADD COLUMN IF NOT EXISTS cavity_count INTEGER DEFAULT 1 CHECK (cavity_count > 0);

COMMENT ON COLUMN public.inner_templates.cavity_count IS 'Number of cavities in the mold for this inner template';
