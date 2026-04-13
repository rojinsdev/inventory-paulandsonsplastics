-- RPC used by GET /api/system/health (System Health page).
-- Ensures function exists when 202604100003 was skipped or only partially applied.

CREATE OR REPLACE FUNCTION public.get_system_health_summary() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_health_summary jsonb;
    v_pending_orders int;
    v_reserved_orders int;
    v_pending_requests int;
    v_negative_stock_count int;
    v_total_stock_entries int;
BEGIN
    SELECT COUNT(*) INTO v_pending_orders FROM public.sales_orders WHERE status = 'pending';
    SELECT COUNT(*) INTO v_reserved_orders FROM public.sales_orders WHERE status = 'reserved';
    SELECT COUNT(*) INTO v_pending_requests FROM public.production_requests WHERE status = 'pending';
    SELECT COUNT(*) INTO v_negative_stock_count FROM public.stock_balances WHERE quantity < 0;
    SELECT COUNT(*) INTO v_total_stock_entries FROM public.stock_balances;

    v_health_summary := jsonb_build_object(
        'timestamp', NOW(),
        'orders', jsonb_build_object(
            'pending', v_pending_orders,
            'reserved', v_reserved_orders
        ),
        'production_requests', jsonb_build_object(
            'pending', v_pending_requests
        ),
        'stock', jsonb_build_object(
            'total_entries', v_total_stock_entries,
            'negative_entries', v_negative_stock_count,
            'health_percentage', CASE WHEN v_total_stock_entries > 0
                THEN ROUND(((v_total_stock_entries - v_negative_stock_count)::numeric / v_total_stock_entries) * 100, 2)
                ELSE 100
            END
        ),
        'overall_status', CASE
            WHEN v_negative_stock_count = 0 THEN 'healthy'
            WHEN v_negative_stock_count < 10 THEN 'warning'
            ELSE 'critical'
        END
    );

    RETURN v_health_summary;
END;
$function$;

COMMENT ON FUNCTION public.get_system_health_summary() IS 'Quick health metrics for admin dashboard (orders, production requests, stock).';

GRANT EXECUTE ON FUNCTION public.get_system_health_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_system_health_summary() TO authenticated;
