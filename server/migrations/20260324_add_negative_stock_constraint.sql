-- Fix existing negative stock before applying constraint
UPDATE stock_balances 
SET quantity = 0 
WHERE quantity < 0;

-- Add CHECK constraint to prevent future negative stock
ALTER TABLE stock_balances 
ADD CONSTRAINT stock_balances_quantity_check 
CHECK (quantity >= 0);
