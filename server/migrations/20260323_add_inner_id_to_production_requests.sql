-- Migration: Add inner_id to production_requests
-- Description: Supports inner production requests triggered by sales orders lacking inner stock
-- Date: 2026-03-23

ALTER TABLE production_requests ADD COLUMN IF NOT EXISTS inner_id UUID REFERENCES inners(id) ON DELETE CASCADE;
COMMENT ON COLUMN production_requests.inner_id IS 'Inner requested for production if stock is insufficient during sale';
