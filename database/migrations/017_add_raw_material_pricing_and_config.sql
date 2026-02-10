-- Add pricing and configuration fields to raw_materials
ALTER TABLE raw_materials 
ADD COLUMN IF NOT EXISTS bag_weight_kg NUMERIC NOT NULL DEFAULT 25,
ADD COLUMN IF NOT EXISTS last_cost_per_kg NUMERIC;

-- Add pricing fields to inventory_transactions for audit trail
ALTER TABLE inventory_transactions
ADD COLUMN IF NOT EXISTS cost_per_kg NUMERIC,
ADD COLUMN IF NOT EXISTS total_cost NUMERIC;

COMMENT ON COLUMN raw_materials.bag_weight_kg IS 'Configurable weight of a single bag in kg (used for conversions)';
COMMENT ON COLUMN raw_materials.last_cost_per_kg IS 'Last recorded purchase price per kilogram';
COMMENT ON COLUMN inventory_transactions.cost_per_kg IS 'The rate per kilo recorded for this transaction';
COMMENT ON COLUMN inventory_transactions.total_cost IS 'Calculated total cost for the transaction (quantity_kg * cost_per_kg)';
