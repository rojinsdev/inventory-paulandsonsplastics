-- Migration: make_product_id_nullable_in_sales_items
-- Created: 2026-04-03

ALTER TABLE public.sales_order_items ALTER COLUMN product_id DROP NOT NULL;
