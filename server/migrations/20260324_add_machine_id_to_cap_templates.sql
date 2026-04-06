-- Migration to add machine_id to cap_templates
ALTER TABLE public.cap_templates ADD COLUMN machine_id UUID REFERENCES public.machines(id);

-- Optional: Link existing templates to a machine if they were already linked to variants
-- This is a bit tricky but since it's dev, we can try to backfill
UPDATE public.cap_templates ct
SET machine_id = (SELECT machine_id FROM public.caps c WHERE c.template_id = ct.id AND machine_id IS NOT NULL LIMIT 1)
WHERE machine_id IS NULL;
