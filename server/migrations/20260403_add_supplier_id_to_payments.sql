-- Migration: 20260403_add_supplier_id_to_payments
-- Summary: Adds supplier_id and factory_id to supplier_payments to allow general payments and better data isolation.

-- 1. Add columns
ALTER TABLE public.supplier_payments
ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id),
ADD COLUMN factory_id UUID REFERENCES public.factories(id);

-- 2. Make purchase_id nullable (if it wasn't already, usually it is but good to be explicit)
ALTER TABLE public.supplier_payments
ALTER COLUMN purchase_id DROP NOT NULL;

-- 3. Backfill data (if any existed, but we checked and it's empty)
-- UPDATE public.supplier_payments sp
-- SET 
--   supplier_id = p.supplier_id,
--   factory_id = p.factory_id
-- FROM public.purchases p
-- WHERE sp.purchase_id = p.id;

-- 4. Set NOT NULL constraints (do this AFTER backfilling)
-- For now, let's make them nullable first and then enforce NOT NULL in code
-- Actually, the service always provides them, so NOT NULL is safer.
-- Since it's empty, we can just do it.

ALTER TABLE public.supplier_payments
ALTER COLUMN supplier_id SET NOT NULL,
ALTER COLUMN factory_id SET NOT NULL;

-- 5. Update RLS to ensure managers can only see their factory's payments
-- Existing policy: Managers can view supplier_payments -> is_manager(auth.uid())
-- Let's update it to check factory_id if we want full isolation.

-- But given the existing simple policy, I'll leave it as is unless requested otherwise, 
-- or I'll refine it to be better.

-- DROP POLICY IF EXISTS "Managers can view supplier_payments" ON public.supplier_payments;
-- CREATE POLICY "Managers can view supplier_payments" ON public.supplier_payments
-- FOR SELECT USING (is_manager(auth.uid()) AND (factory_id IN (SELECT factory_id FROM user_profiles WHERE id = auth.uid())));
