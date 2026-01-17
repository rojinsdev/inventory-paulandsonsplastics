-- Migration: Add type field to machines table
-- This is a safe migration - adds a new column with a default value

-- Add the type column
ALTER TABLE machines 
ADD COLUMN IF NOT EXISTS type TEXT 
CHECK (type IN ('extruder', 'cutting', 'printing', 'packing')) 
NOT NULL DEFAULT 'extruder';

-- Add comment for clarity
COMMENT ON COLUMN machines.type IS 'Type of machine (extruder, cutting, printing, packing)';

-- Optional: Update existing machines to appropriate types if known
-- UPDATE machines SET type = 'cutting' WHERE name LIKE '%Cutting%';
-- UPDATE machines SET type = 'printing' WHERE name LIKE '%Print%';
-- UPDATE machines SET type = 'packing' WHERE name LIKE '%Pack%';
