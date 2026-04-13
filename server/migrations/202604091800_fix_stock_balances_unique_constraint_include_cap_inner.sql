-- Fix stock_balances unique constraint to include cap_id and inner_id
-- The previous constraint (product_id, factory_id, state, unit_type) was too narrow:
-- it prevented storing the same tub packed with two different caps (e.g. Cap A White 
-- and Cap B Blue), since both would be packed/packet rows for the same product.
--
-- The correct constraint must include cap_id and inner_id so that each
-- tub+cap+inner combination is tracked as a distinct inventory row.
-- NULLS NOT DISTINCT ensures that (productA, packed, packet, NULL, NULL) is itself
-- unique (loose/semi_finished rows have no cap/inner).

ALTER TABLE public.stock_balances
    DROP CONSTRAINT IF EXISTS stock_balances_product_id_factory_id_state_unit_type_key;

ALTER TABLE public.stock_balances
    ADD CONSTRAINT stock_balances_unique_combo
    UNIQUE NULLS NOT DISTINCT (product_id, factory_id, state, unit_type, cap_id, inner_id);

-- Remove the duplicate unique constraint on cap_stock_balances that was added 
-- in migration 202604091620 (cap_stock_balances_unique_composite already existed)
ALTER TABLE public.cap_stock_balances
    DROP CONSTRAINT IF EXISTS cap_stock_balances_cap_id_factory_id_state_unit_type_key;
