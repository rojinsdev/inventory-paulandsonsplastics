-- Migration 048: Security Cleanup (v2)
-- Description: Sets security_invoker on views and hardens function search_paths.

-----------------------------------------------------------
-- 1. HARDEN VIEWS (Postgres 15+)
-----------------------------------------------------------
DROP VIEW IF EXISTS public.at_risk_customers;
CREATE VIEW public.at_risk_customers WITH (security_invoker = true) AS
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
   FROM (public.customers c
     JOIN public.customer_analytics ca ON ((c.id = ca.customer_id)))
  WHERE (ca.customer_segment = 'at_risk'::text)
  ORDER BY ca.days_since_last_order DESC;

DROP VIEW IF EXISTS public.vip_customers;
CREATE VIEW public.vip_customers WITH (security_invoker = true) AS
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
   FROM (public.customers c
     JOIN public.customer_analytics ca ON ((c.id = ca.customer_id)))
  WHERE (ca.customer_segment = 'vip'::text)
  ORDER BY ca.total_purchase_value DESC;

-----------------------------------------------------------
-- 2. HARDEN FUNCTIONS (Set search_path)
-----------------------------------------------------------
ALTER FUNCTION public.adjust_cap_stock(uuid, uuid, numeric) SET search_path = public;
ALTER FUNCTION public.adjust_raw_material_stock(uuid, numeric) SET search_path = public;
ALTER FUNCTION public.adjust_stock(uuid, uuid, text, numeric, uuid) SET search_path = public;
ALTER FUNCTION public.adjust_stock(uuid, uuid, inventory_state, numeric, uuid, text) SET search_path = public;
ALTER FUNCTION public.calculate_customer_analytics(uuid) SET search_path = public;
ALTER FUNCTION public.handle_updated_at() SET search_path = public;
ALTER FUNCTION public.update_factories_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.validate_product_raw_material_factory() SET search_path = public;
