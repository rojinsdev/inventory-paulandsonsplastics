-- Migration 050: Fix RLS Recursion in user_profiles
-- Description: Replaces recursive RLS policy checks with SECURITY DEFINER functions.

-- 1. Create SECURITY DEFINER functions for role checks
-- These functions bypass RLS because they are SECURITY DEFINER and owned by a superuser (or the migration runner)
-- We set the search_path to 'public' to prevent search path attacks.

CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = user_id 
        AND role = 'admin' 
        AND active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_manager(user_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = user_id 
        AND role IN ('admin', 'production_manager') 
        AND active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Update user_profiles policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
CREATE POLICY "Admins can view all profiles" ON public.user_profiles
    FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage profiles" ON public.user_profiles;
CREATE POLICY "Admins can manage profiles" ON public.user_profiles
    FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- 3. Update master data policies (Fixing potential future recursion)
DO $$
DECLARE
    t text;
    master_tables text[] := ARRAY['machines', 'products', 'machine_products', 'raw_materials', 'factories', 'product_templates', 'cap_templates', 'packing_rules'];
BEGIN
    FOREACH t IN ARRAY master_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Admins can manage %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Admins can manage %I" ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid()))', t, t);
    END LOOP;
END $$;

-- 4. Update Business Process Data
DROP POLICY IF EXISTS "Authorized roles can manage production requests" ON public.production_requests;
CREATE POLICY "Authorized roles can manage production requests" ON public.production_requests
    FOR ALL TO authenticated USING (public.is_manager(auth.uid()));

-- 5. Update Sensitive Data
DO $$
DECLARE
    t text;
    sensitive_tables text[] := ARRAY['customers', 'payments', 'cash_flow_categories', 'cash_flow_logs', 'supplier_payments'];
BEGIN
    FOREACH t IN ARRAY sensitive_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Admins can manage %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Admins can manage %I" ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid()))', t, t);
        
        EXECUTE format('DROP POLICY IF EXISTS "Managers can view %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Managers can view %I" ON public.%I FOR SELECT TO authenticated USING (public.is_manager(auth.uid()))', t, t);
    END LOOP;
END $$;

-- 6. Update Analytics & Monitoring
DO $$
DECLARE
    t text;
    analytics_tables text[] := ARRAY['demand_analytics', 'seasonal_patterns', 'production_recommendations', 'demand_forecasts', 'notifications'];
BEGIN
    FOREACH t IN ARRAY analytics_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "System can manage %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "System can manage %I" ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid()))', t, t);
    END LOOP;
END $$;
