-- Error Logging System: Comprehensive error tracking and debugging support
-- This helps identify and resolve issues quickly

-- Create error log table
CREATE TABLE IF NOT EXISTS public.system_error_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    error_type TEXT NOT NULL, -- 'rpc_error', 'validation_error', 'constraint_violation', etc.
    function_name TEXT, -- Which RPC or function failed
    error_message TEXT NOT NULL,
    error_context JSONB, -- Detailed context (parameters, state, etc.)
    user_id UUID,
    order_id UUID,
    stack_trace TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.system_error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON public.system_error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_function_name ON public.system_error_logs(function_name);
CREATE INDEX IF NOT EXISTS idx_error_logs_order_id ON public.system_error_logs(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved ON public.system_error_logs(created_at DESC) WHERE resolved_at IS NULL;

-- Function to log errors with context
CREATE OR REPLACE FUNCTION public.log_system_error(
    p_error_type text,
    p_function_name text,
    p_error_message text,
    p_error_context jsonb DEFAULT NULL,
    p_user_id uuid DEFAULT NULL,
    p_order_id uuid DEFAULT NULL,
    p_stack_trace text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_log_id uuid;
BEGIN
    INSERT INTO public.system_error_logs (
        error_type, function_name, error_message, error_context,
        user_id, order_id, stack_trace
    ) VALUES (
        p_error_type, p_function_name, p_error_message, p_error_context,
        p_user_id, p_order_id, p_stack_trace
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$function$;

-- Function to get recent errors summary
CREATE OR REPLACE FUNCTION public.get_recent_errors_summary(
    p_hours_back int DEFAULT 24,
    p_limit int DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_errors jsonb;
    v_summary jsonb;
    v_error_counts jsonb;
BEGIN
    -- Get error counts by type
    SELECT jsonb_object_agg(error_type, error_count)
    INTO v_error_counts
    FROM (
        SELECT error_type, COUNT(*) as error_count
        FROM public.system_error_logs
        WHERE created_at >= NOW() - INTERVAL '1 hour' * p_hours_back
        AND resolved_at IS NULL
        GROUP BY error_type
        ORDER BY error_count DESC
    ) counts;

    -- Get recent errors with details
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'error_type', error_type,
            'function_name', function_name,
            'error_message', error_message,
            'error_context', error_context,
            'order_id', order_id,
            'created_at', created_at,
            'age_minutes', EXTRACT(EPOCH FROM (NOW() - created_at)) / 60
        ) ORDER BY created_at DESC
    )
    INTO v_errors
    FROM public.system_error_logs
    WHERE created_at >= NOW() - INTERVAL '1 hour' * p_hours_back
    AND resolved_at IS NULL
    LIMIT p_limit;

    RETURN jsonb_build_object(
        'summary', jsonb_build_object(
            'hours_back', p_hours_back,
            'total_unresolved', COALESCE(jsonb_array_length(v_errors), 0),
            'error_counts_by_type', COALESCE(v_error_counts, '{}'::jsonb)
        ),
        'recent_errors', COALESCE(v_errors, '[]'::jsonb)
    );
END;
$function$;

-- Function to mark error as resolved
CREATE OR REPLACE FUNCTION public.resolve_system_error(
    p_error_id uuid,
    p_resolution_notes text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    UPDATE public.system_error_logs
    SET resolved_at = NOW(),
        resolution_notes = p_resolution_notes
    WHERE id = p_error_id
    AND resolved_at IS NULL;
    
    RETURN FOUND;
END;
$function$;

-- Create system monitoring view
CREATE OR REPLACE VIEW public.system_health_dashboard AS
SELECT 
    -- Error summary
    (SELECT COUNT(*) FROM public.system_error_logs WHERE created_at >= NOW() - INTERVAL '1 hour' AND resolved_at IS NULL) as errors_last_hour,
    (SELECT COUNT(*) FROM public.system_error_logs WHERE created_at >= NOW() - INTERVAL '24 hours' AND resolved_at IS NULL) as errors_last_24h,
    
    -- Order status summary
    (SELECT COUNT(*) FROM public.sales_orders WHERE status = 'pending') as pending_orders,
    (SELECT COUNT(*) FROM public.sales_orders WHERE status = 'reserved') as reserved_orders,
    (SELECT COUNT(*) FROM public.sales_orders WHERE status = 'delivered' AND delivered_at >= CURRENT_DATE) as delivered_today,
    
    -- Production requests
    (SELECT COUNT(*) FROM public.production_requests WHERE status = 'pending') as pending_production_requests,
    
    -- Stock health
    (SELECT COUNT(*) FROM public.stock_balances WHERE quantity < 0) as negative_stock_entries,
    (SELECT COUNT(*) FROM public.stock_balances) as total_stock_entries,
    
    -- System timestamp
    NOW() as last_updated;

-- Add RLS policies for error logs (only admins can see)
ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view error logs" ON public.system_error_logs;
DROP POLICY IF EXISTS "System can insert error logs" ON public.system_error_logs;

CREATE POLICY "Admins can view error logs" ON public.system_error_logs
    FOR SELECT TO authenticated
    USING (public.is_admin(auth.uid()));

CREATE POLICY "System can insert error logs" ON public.system_error_logs
    FOR INSERT TO authenticated
    WITH CHECK (true); -- Allow system to log errors

-- Grant permissions
GRANT SELECT ON public.system_health_dashboard TO authenticated;
GRANT ALL ON public.system_error_logs TO service_role;

-- Add helpful comments
COMMENT ON TABLE public.system_error_logs IS 'Comprehensive error logging for system debugging and monitoring';
COMMENT ON FUNCTION public.log_system_error IS 'Logs system errors with full context for debugging';
COMMENT ON FUNCTION public.get_recent_errors_summary IS 'Gets summary of recent unresolved errors';
COMMENT ON FUNCTION public.resolve_system_error IS 'Marks an error as resolved with optional notes';
COMMENT ON VIEW public.system_health_dashboard IS 'Real-time system health metrics dashboard';