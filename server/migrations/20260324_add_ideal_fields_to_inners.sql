-- Add ideal weight and cycle time columns to inners table to match caps table structure
ALTER TABLE public.inners ADD COLUMN IF NOT EXISTS ideal_weight_grams NUMERIC;
ALTER TABLE public.inners ADD COLUMN IF NOT EXISTS ideal_cycle_time_seconds NUMERIC DEFAULT 0;

-- Backfill from template
UPDATE public.inners i
SET 
  ideal_weight_grams = it.ideal_weight_grams,
  ideal_cycle_time_seconds = it.ideal_cycle_time_seconds
FROM public.inner_templates it
WHERE i.template_id = it.id;
