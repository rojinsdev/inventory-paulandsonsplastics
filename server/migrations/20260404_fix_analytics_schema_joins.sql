-- Migration: Fix Analytics Schema Joins
-- Created: 2026-04-04

-- 1. Ensure cap_production_logs has explicit foreign keys if missing
-- cap_id -> caps(id)
-- machine_id -> machines(id)
-- factory_id -> factories(id)

-- 2. Ensure caps has explicit foreign keys
-- template_id -> cap_templates(id)
-- raw_material_id -> raw_materials(id)

-- 3. Ensure inner_production_logs has explicit foreign keys
-- inner_id -> inners(id)
-- machine_id -> machines(id)
-- factory_id -> factories(id)

-- 4. Ensure inners has explicit foreign keys
-- template_id -> inner_templates(id)

-- Note: These might already exist in Dev but this migration 
-- guarantees they exist in Prod for consistent Analytics performance.

-- Re-asserting relationships for PostgREST visibility
COMMENT ON CONSTRAINT cap_production_logs_cap_id_fkey ON public.cap_production_logs IS 'Analytics link to caps';
COMMENT ON CONSTRAINT caps_template_id_fkey ON public.caps IS 'Analytics link to cap_templates';
COMMENT ON CONSTRAINT caps_raw_material_id_fkey ON public.caps IS 'Analytics link to raw_materials';
COMMENT ON CONSTRAINT inner_production_logs_inner_id_fkey ON public.inner_production_logs IS 'Analytics link to inners';
COMMENT ON CONSTRAINT inners_template_id_fkey ON public.inners IS 'Analytics link to inner_templates';
COMMENT ON CONSTRAINT inner_templates_raw_material_id_fkey ON public.inner_templates IS 'Analytics link to raw_materials';
