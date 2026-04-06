-- Create machine_cap_templates table
CREATE TABLE IF NOT EXISTS public.machine_cap_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID REFERENCES public.machines(id) ON DELETE CASCADE,
    cap_template_id UUID REFERENCES public.cap_templates(id) ON DELETE CASCADE,
    ideal_cycle_time_seconds NUMERIC NOT NULL,
    capacity_restriction NUMERIC,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(machine_id, cap_template_id)
);

-- Enable RLS
ALTER TABLE public.machine_cap_templates ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies
CREATE POLICY "Enable all for authenticated users" ON public.machine_cap_templates
    FOR ALL USING (auth.role() = 'authenticated');

-- Migrate existing data from cap_templates
INSERT INTO public.machine_cap_templates (machine_id, cap_template_id, ideal_cycle_time_seconds)
SELECT 
    machine_id, 
    id as cap_template_id, 
    COALESCE(ideal_cycle_time_seconds, 0) as ideal_cycle_time_seconds
FROM public.cap_templates
WHERE machine_id IS NOT NULL;

-- Remove legacy columns from cap_templates
ALTER TABLE public.cap_templates DROP COLUMN IF EXISTS machine_id;
ALTER TABLE public.cap_templates DROP COLUMN IF EXISTS ideal_cycle_time_seconds;

-- Remove legacy columns from caps
ALTER TABLE public.caps DROP COLUMN IF EXISTS machine_id;
ALTER TABLE public.caps DROP COLUMN IF EXISTS ideal_cycle_time_seconds;

-- Add machine_id to cap_production_logs
ALTER TABLE public.cap_production_logs ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES public.machines(id);
