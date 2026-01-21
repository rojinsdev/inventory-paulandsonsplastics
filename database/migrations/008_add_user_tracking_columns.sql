-- Migration: Add user tracking columns
-- Description: Add user_id to production_logs and delivered_at to sales_orders
-- Date: 2026-01-18

-- 1. Add user_id column to production_logs table
-- This tracks which production manager submitted each production entry
ALTER TABLE production_logs
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index for faster queries by user
CREATE INDEX IF NOT EXISTS idx_production_logs_user_id ON production_logs(user_id);

-- 2. Add delivered_at column to sales_orders table
-- This records the exact timestamp when an order was delivered
ALTER TABLE sales_orders
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Create index for delivery date queries
CREATE INDEX IF NOT EXISTS idx_sales_orders_delivered_at ON sales_orders(delivered_at);

-- 3. Add a comment explaining the columns
COMMENT ON COLUMN production_logs.user_id IS 'The production manager who submitted this production entry';
COMMENT ON COLUMN sales_orders.delivered_at IS 'Timestamp when the order was marked as delivered';
