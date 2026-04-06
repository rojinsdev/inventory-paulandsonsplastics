-- Create a unified view for all production activity
CREATE OR REPLACE VIEW public.unified_production_history AS
-- 1. Product Extrusion (Tubs)
SELECT 
    pl.id,
    pl.created_at AS timestamp,
    'tub'::text AS item_type,
    'produced'::text AS action_type,
    pl.product_id AS item_id,
    p.name || ' (' || p.size || ')' AS item_name,
    pl.actual_quantity::numeric AS quantity,
    'loose'::text AS unit_type,
    COALESCE(pl.user_id, pl.created_by) AS user_id,
    up.name AS user_name,
    pl.factory_id
FROM public.production_logs pl
JOIN public.products p ON pl.product_id = p.id
LEFT JOIN public.user_profiles up ON COALESCE(pl.user_id, pl.created_by) = up.id

UNION ALL

-- 2. Cap Molding
SELECT 
    cl.id,
    cl.created_at AS timestamp,
    'cap'::text AS item_type,
    'produced'::text AS action_type,
    cl.cap_id AS item_id,
    c.name || ' (' || c.color || ')' AS item_name,
    COALESCE(cl.total_produced, cl.calculated_quantity)::numeric AS quantity,
    'loose'::text AS unit_type,
    cl.user_id,
    up.name AS user_name,
    cl.factory_id
FROM public.cap_production_logs cl
JOIN public.caps c ON cl.cap_id = c.id
LEFT JOIN public.user_profiles up ON cl.user_id = up.id

UNION ALL

-- 3. Inner Molding
SELECT 
    il.id,
    il.created_at AS timestamp,
    'inner'::text AS item_type,
    'produced'::text AS action_type,
    il.inner_id AS item_id,
    itt.name || ' (' || inn.color || ')' AS item_name,
    il.calculated_quantity::numeric AS quantity,
    'loose'::text AS unit_type,
    il.user_id,
    up.name AS user_name,
    il.factory_id
FROM public.inner_production_logs il
JOIN public.inners inn ON il.inner_id = inn.id
JOIN public.inner_templates itt ON inn.template_id = itt.id
LEFT JOIN public.user_profiles up ON il.user_id = up.id

UNION ALL

-- 4. Packaging Transactions (Packing/Bundling)
SELECT 
    it.id,
    it.created_at AS timestamp,
    'tub'::text AS item_type,
    it.transaction_type AS action_type,
    it.product_id AS item_id,
    p.name || ' (' || p.size || ')' AS item_name,
    it.quantity AS quantity,
    it.unit_type AS unit_type,
    it.created_by AS user_id,
    up.name AS user_name,
    it.factory_id
FROM public.inventory_transactions it
JOIN public.products p ON it.product_id = p.id
LEFT JOIN public.user_profiles up ON it.created_by = up.id
WHERE it.transaction_type IN ('packing', 'bundle');

-- Permissions
ALTER VIEW public.unified_production_history OWNER TO postgres;
GRANT SELECT ON public.unified_production_history TO authenticated;
GRANT SELECT ON public.unified_production_history TO service_role;
