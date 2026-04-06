-- Create Unified Production History view
CREATE OR REPLACE VIEW public.unified_production_history AS
SELECT 
    pl.id,
    pl.created_at as timestamp,
    pl.factory_id,
    pl.user_id,
    'tub'::text as item_type,
    'production'::text as action_type,
    pl.product_id as item_id,
    p.name || ' (' || p.size || ')' as item_display_name,
    pl.actual_quantity as quantity,
    pl.shift_number,
    null::text as notes
FROM production_logs pl
JOIN products p ON pl.product_id = p.id

UNION ALL

SELECT 
    cpl.id,
    cpl.created_at as timestamp,
    cpl.factory_id,
    cpl.user_id,
    'cap'::text as item_type,
    'production'::text as action_type,
    cpl.cap_id as item_id,
    ct.name || ' (' || c.color || ')' as item_display_name,
    COALESCE(cpl.total_produced, cpl.calculated_quantity) as quantity,
    cpl.shift_number,
    cpl.remarks as notes
FROM cap_production_logs cpl
JOIN caps c ON cpl.cap_id = c.id
JOIN cap_templates ct ON c.template_id = ct.id

UNION ALL

SELECT 
    ipl.id,
    ipl.created_at as timestamp,
    ipl.factory_id,
    ipl.user_id,
    'inner'::text as item_type,
    'production'::text as action_type,
    ipl.inner_id as item_id,
    it.name || ' (' || i.color || ')' as item_display_name,
    ipl.calculated_quantity as quantity,
    ipl.shift_number,
    null::text as notes
FROM inner_production_logs ipl
JOIN inners i ON ipl.inner_id = i.id
JOIN inner_templates it ON i.template_id = it.id

UNION ALL

SELECT 
    itxn.id,
    itxn.created_at as timestamp,
    itxn.factory_id,
    itxn.created_by as user_id,
    CASE 
        WHEN itxn.transaction_type = 'bundle' THEN 'bundle'
        WHEN itxn.transaction_type = 'pack' THEN 'pack'
        ELSE 'other'
    END as item_type,
    itxn.transaction_type as action_type,
    itxn.product_id as item_id,
    p.name || ' (' || p.size || ')' as item_display_name,
    itxn.quantity as quantity,
    null::integer as shift_number,
    itxn.note as notes
FROM inventory_transactions itxn
JOIN products p ON itxn.product_id = p.id
WHERE itxn.transaction_type IN ('bundle', 'pack');
