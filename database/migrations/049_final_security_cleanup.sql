-- Migration 049: Final Security Cleanup (v3)
-- Description: Hardens search_path for remaining functions identified in advisor report.

ALTER FUNCTION public.trigger_update_customer_analytics() SET search_path = public;
ALTER FUNCTION public.calculate_forecast_accuracy() SET search_path = public;
ALTER FUNCTION public.update_user_profiles_updated_at() SET search_path = public;
ALTER FUNCTION public.update_settings_timestamp() SET search_path = public;
ALTER FUNCTION public.validate_product_raw_material_factory() SET search_path = public;
