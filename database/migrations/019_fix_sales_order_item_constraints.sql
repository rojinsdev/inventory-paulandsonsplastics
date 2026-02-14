-- Migration 019: Fix Sales Order Item Constraints
-- Description: Makes quantity_bundles nullable (legacy) and quantity mandatory for multi-unit sales.

ALTER TABLE sales_order_items ALTER COLUMN quantity_bundles DROP NOT NULL;
ALTER TABLE sales_order_items ALTER COLUMN quantity SET NOT NULL;
