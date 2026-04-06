-- Update unified_production_history view to align with mobile app expectations
-- Changes: 
-- 1. Joins with user_profiles to include user_name
-- 2. Renames item_display_name to item_name
-- 3. Adds a unit column
-- 4. Ensures action_type and item_type are consistent

DROP VIEW IF EXISTS public.unified_production_history CASCADE;

CREATE VIEW public.unified_production_history AS
 SELECT pl.id,
    pl.created_at AS "timestamp",
    pl.factory_id,
    pl.user_id,
    up.name AS user_name,
    'tub'::text AS item_type,
    'production'::text AS action_type,
    pl.product_id AS item_id,
    (((p.name || ' ('::text) || p.size) || ')'::text) AS item_name,
    pl.actual_quantity::numeric AS quantity,
    'pcs'::text AS unit,
    pl.shift_number,
    NULL::text AS notes
   FROM ((production_logs pl
     JOIN products p ON ((pl.product_id = p.id)))
     LEFT JOIN user_profiles up ON ((pl.user_id = up.id)))
UNION ALL
 SELECT cpl.id,
    cpl.created_at AS "timestamp",
    cpl.factory_id,
    cpl.user_id,
    up.name AS user_name,
    'cap'::text AS item_type,
    'production'::text AS action_type,
    cpl.cap_id AS item_id,
    (((ct.name || ' ('::text) || c.color) || ')'::text) AS item_name,
    COALESCE(cpl.total_produced, cpl.calculated_quantity)::numeric AS quantity,
    'pcs'::text AS unit,
    cpl.shift_number,
    cpl.remarks AS notes
   FROM (((cap_production_logs cpl
     JOIN caps c ON ((cpl.cap_id = c.id)))
     JOIN cap_templates ct ON ((c.template_id = ct.id)))
     LEFT JOIN user_profiles up ON ((cpl.user_id = up.id)))
UNION ALL
 SELECT ipl.id,
    ipl.created_at AS "timestamp",
    ipl.factory_id,
    ipl.user_id,
    up.name AS user_name,
    'inner'::text AS item_type,
    'production'::text AS action_type,
    ipl.inner_id AS item_id,
    (((it.name || ' ('::text) || i.color) || ')'::text) AS item_name,
    ipl.calculated_quantity::numeric AS quantity,
    'pcs'::text AS unit,
    ipl.shift_number,
    NULL::text AS notes
   FROM (((inner_production_logs ipl
     JOIN inners i ON ((ipl.inner_id = i.id)))
     JOIN inner_templates it ON ((i.template_id = it.id)))
     LEFT JOIN user_profiles up ON ((ipl.user_id = up.id)))
UNION ALL
 SELECT itxn.id,
    itxn.created_at AS "timestamp",
    itxn.factory_id,
    itxn.created_by AS user_id,
    up.name AS user_name,
        CASE
            WHEN (itxn.transaction_type = 'bundle'::text) THEN 'bundle'::text
            WHEN (itxn.transaction_type = 'pack'::text) THEN 'pack'::text
            ELSE 'other'::text
        END AS item_type,
    itxn.transaction_type AS action_type,
    itxn.product_id AS item_id,
    (((p.name || ' ('::text) || p.size) || ')'::text) AS item_name,
    itxn.quantity::numeric AS quantity,
    itxn.unit_type AS unit,
    NULL::integer AS shift_number,
    itxn.note AS notes
   FROM ((inventory_transactions itxn
     JOIN products p ON ((itxn.product_id = p.id)))
     LEFT JOIN user_profiles up ON ((itxn.created_by = up.id)))
  WHERE (itxn.transaction_type = ANY (ARRAY['bundle'::text, 'pack'::text, 'unpack'::text]));
