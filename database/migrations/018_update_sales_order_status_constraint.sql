-- Migration: Update check constraint on sales_orders status to include 'pending'

ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check;

ALTER TABLE sales_orders 
ADD CONSTRAINT sales_orders_status_check 
CHECK (status IN ('reserved', 'delivered', 'cancelled', 'pending'));
