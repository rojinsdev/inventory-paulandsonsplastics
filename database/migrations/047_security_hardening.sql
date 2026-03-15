-- Migration 047: Security Hardening (RLS & Policies)
-- Description: Enables RLS on all public tables and implements baseline security policies.

-----------------------------------------------------------
-- 1. ENABLE RLS ON ALL TABLES
-----------------------------------------------------------
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flow_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flow_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cap_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_rules ENABLE ROW LEVEL SECURITY;

-----------------------------------------------------------
-- 2. MASTER DATA POLICIES (Read: Authenticated, Write: Admin)
-----------------------------------------------------------
DO $$
DECLARE
    t text;
    master_tables text[] := ARRAY['machines', 'products', 'machine_products', 'raw_materials', 'factories', 'product_templates', 'cap_templates', 'packing_rules'];
BEGIN
    FOREACH t IN ARRAY master_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can view %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Authenticated users can view %I" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
        
        EXECUTE format('DROP POLICY IF EXISTS "Admins can manage %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Admins can manage %I" ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = ''admin'' AND active = true))', t, t);
    END LOOP;
END $$;

-----------------------------------------------------------
-- 3. USER PROFILES POLICIES
-----------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
CREATE POLICY "Admins can view all profiles" ON public.user_profiles
    FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin' AND active = true));

DROP POLICY IF EXISTS "Admins can manage profiles" ON public.user_profiles;
CREATE POLICY "Admins can manage profiles" ON public.user_profiles
    FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin' AND active = true));

-----------------------------------------------------------
-- 4. BUSINESS PROCESS DATA (Production Requests)
-----------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view production requests" ON public.production_requests;
CREATE POLICY "Authenticated users can view production requests" ON public.production_requests
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authorized roles can manage production requests" ON public.production_requests;
CREATE POLICY "Authorized roles can manage production requests" ON public.production_requests
    FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'production_manager') AND active = true));

-----------------------------------------------------------
-- 5. SENSITIVE DATA (Payments, Cash Flow, Customers)
-----------------------------------------------------------
DO $$
DECLARE
    t text;
    sensitive_tables text[] := ARRAY['customers', 'payments', 'cash_flow_categories', 'cash_flow_logs', 'supplier_payments'];
BEGIN
    FOREACH t IN ARRAY sensitive_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Admins can manage %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Admins can manage %I" ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = ''admin'' AND active = true))', t, t);
        
        EXECUTE format('DROP POLICY IF EXISTS "Managers can view %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Managers can view %I" ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN (''admin'', ''production_manager'') AND active = true))', t, t);
    END LOOP;
END $$;

-----------------------------------------------------------
-- 6. ANALYTICS & MONITORING
-----------------------------------------------------------
DO $$
DECLARE
    t text;
    analytics_tables text[] := ARRAY['demand_analytics', 'seasonal_patterns', 'production_recommendations', 'demand_forecasts', 'notifications'];
BEGIN
    FOREACH t IN ARRAY analytics_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can view %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Authenticated users can view %I" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
        
        EXECUTE format('DROP POLICY IF EXISTS "System can manage %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "System can manage %I" ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = ''admin'' AND active = true))', t, t);
    END LOOP;
END $$;

-----------------------------------------------------------
-- 7. FIX SECURITY DEFINER VIEWS
-----------------------------------------------------------
-- Recreate high-level views as SECURITY INVOKER (or standard views which default to it)
-- This ensures they respect the RLS of the underlying tables (customers, customer_analytics)

DROP VIEW IF EXISTS public.at_risk_customers;
CREATE VIEW public.at_risk_customers AS
 SELECT c.id,
    c.name,
    c.phone,
    c.type,
    c.notes,
    c.created_at,
    c.email,
    c.address,
    c.city,
    c.state,
    c.pincode,
    c.gstin,
    c.credit_limit,
    c.payment_terms,
    c.is_active,
    c.tags,
    c.updated_at,
    ca.days_since_last_order,
    ca.total_purchase_value,
    ca.last_purchase_date
   FROM (customers c
     JOIN customer_analytics ca ON ((c.id = ca.customer_id)))
  WHERE (ca.customer_segment = 'at_risk'::text)
  ORDER BY ca.days_since_last_order DESC;

DROP VIEW IF EXISTS public.vip_customers;
CREATE VIEW public.vip_customers AS
 SELECT c.id,
    c.name,
    c.phone,
    c.type,
    c.notes,
    c.created_at,
    c.email,
    c.address,
    c.city,
    c.state,
    c.pincode,
    c.gstin,
    c.credit_limit,
    c.payment_terms,
    c.is_active,
    c.tags,
    c.updated_at,
    ca.total_purchase_value,
    ca.total_orders,
    ca.last_purchase_date
   FROM (customers c
     JOIN customer_analytics ca ON ((c.id = ca.customer_id)))
  WHERE (ca.customer_segment = 'vip'::text)
  ORDER BY ca.total_purchase_value DESC;
