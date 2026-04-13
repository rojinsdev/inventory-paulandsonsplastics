-- Cleanup Migration: Removing Ambiguous RPC Overloads
-- These overloads cause 'PGRST203: Could not choose the best candidate' errors in the production environment.

-- 1. DROP the incorrect 'submit_production_atomic' (Old Signature Version)
DROP FUNCTION IF EXISTS public.submit_production_atomic(
    p_machine_id uuid, p_product_id uuid, p_shift_number integer, p_start_time time, p_end_time time,
    p_total_produced integer, p_damaged_count integer, p_actual_cycle_time_seconds numeric,
    p_actual_weight_grams numeric, p_downtime_minutes integer, p_downtime_reason text, 
    p_date date, p_user_id uuid, p_factory_id uuid, p_theoretical_quantity integer,
    p_efficiency_percentage numeric, p_is_cost_recovered boolean, p_shift_hours numeric
);

-- 2. DROP the incorrect 'prepare_order_items_atomic' (Old Signature: missing p_factory_id)
DROP FUNCTION IF EXISTS public.prepare_order_items_atomic(
    p_order_id uuid, p_items jsonb, p_user_id uuid
);

-- 3. DROP the incorrect 'create_order_atomic' (Old Signature: using text dates instead of date types)
DROP FUNCTION IF EXISTS public.create_order_atomic(
    p_customer_id uuid, p_delivery_date text, p_notes text, p_user_id uuid, p_items jsonb, p_order_date text
);
