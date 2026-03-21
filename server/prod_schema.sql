


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."inventory_state" AS ENUM (
    'semi_finished',
    'packed',
    'finished',
    'reserved',
    'delivered',
    'raw_material'
);


ALTER TYPE "public"."inventory_state" OWNER TO "postgres";


CREATE TYPE "public"."production_request_status" AS ENUM (
    'pending',
    'in_production',
    'ready',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."production_request_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_cap_stock"("p_cap_id" "uuid", "p_factory_id" "uuid", "p_quantity_change" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    INSERT INTO cap_stock_balances (cap_id, factory_id, quantity, last_updated)
    VALUES (p_cap_id, p_factory_id, p_quantity_change, now())
    ON CONFLICT (cap_id, factory_id)
    DO UPDATE SET 
        quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
        last_updated = now();
END;
$$;


ALTER FUNCTION "public"."adjust_cap_stock"("p_cap_id" "uuid", "p_factory_id" "uuid", "p_quantity_change" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_raw_material_stock"("p_material_id" "uuid", "p_weight_change" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE raw_materials 
    SET stock_weight_kg = stock_weight_kg + p_weight_change
    WHERE id = p_material_id;
END;
$$;


ALTER FUNCTION "public"."adjust_raw_material_stock"("p_material_id" "uuid", "p_weight_change" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_factory_id" "uuid", "p_state" "text", "p_quantity_change" numeric, "p_cap_id" "uuid" DEFAULT NULL::"uuid", "p_unit_type" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_unit_type TEXT := COALESCE(p_unit_type, '');
BEGIN
    INSERT INTO stock_balances (product_id, factory_id, state, quantity, cap_id, unit_type)
    VALUES (p_product_id, p_factory_id, p_state::inventory_state, p_quantity_change, p_cap_id, v_unit_type)
    ON CONFLICT (product_id, factory_id, state, unit_type, cap_id)
    DO UPDATE SET 
        quantity = stock_balances.quantity + EXCLUDED.quantity,
        last_updated = NOW();
END;
$$;


ALTER FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_factory_id" "uuid", "p_state" "text", "p_quantity_change" numeric, "p_cap_id" "uuid", "p_unit_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_factory_id" "uuid", "p_state" "public"."inventory_state", "p_quantity_change" numeric, "p_cap_id" "uuid" DEFAULT NULL::"uuid", "p_unit_type" "text" DEFAULT ''::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_unit_type TEXT := COALESCE(p_unit_type, '');
BEGIN
    INSERT INTO stock_balances (product_id, factory_id, state, quantity, cap_id, unit_type)
    VALUES (p_product_id, p_factory_id, p_state, p_quantity_change, p_cap_id, v_unit_type)
    ON CONFLICT (product_id, factory_id, state, unit_type, cap_id)
    DO UPDATE SET 
        quantity = stock_balances.quantity + EXCLUDED.quantity,
        last_updated = NOW();
END;
$$;


ALTER FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_factory_id" "uuid", "p_state" "public"."inventory_state", "p_quantity_change" numeric, "p_cap_id" "uuid", "p_unit_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_customer_analytics"("p_customer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_total_orders INTEGER;
    v_delivered_orders INTEGER;
    v_cancelled_orders INTEGER;
    v_reserved_orders INTEGER;
    v_total_value NUMERIC;
    v_delivered_value NUMERIC;
    v_avg_order_value NUMERIC;
    v_first_date TIMESTAMPTZ;
    v_last_date TIMESTAMPTZ;
    v_days_between NUMERIC;
    v_days_since INTEGER;
    v_most_product_id UUID;
    v_most_product_name TEXT;
    v_most_product_qty INTEGER;
    v_segment TEXT;
    v_risk_level TEXT;
BEGIN
    -- Calculate order counts by status
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'delivered'),
        COUNT(*) FILTER (WHERE status = 'cancelled'),
        COUNT(*) FILTER (WHERE status = 'reserved')
    INTO v_total_orders, v_delivered_orders, v_cancelled_orders, v_reserved_orders
    FROM sales_orders
    WHERE customer_id = p_customer_id;

    -- Calculate purchase values
    SELECT 
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'delivered'), 0)
    INTO v_total_value, v_delivered_value
    FROM sales_orders
    WHERE customer_id = p_customer_id;

    -- Calculate average order value (delivered orders only)
    IF v_delivered_orders > 0 THEN
        v_avg_order_value := v_delivered_value / v_delivered_orders;
    ELSE
        v_avg_order_value := 0;
    END IF;

    -- Get first and last purchase dates
    SELECT 
        MIN(order_date),
        MAX(order_date)
    INTO v_first_date, v_last_date
    FROM sales_orders
    WHERE customer_id = p_customer_id AND status = 'delivered';

    -- Calculate average days between orders
    IF v_delivered_orders > 1 AND v_first_date IS NOT NULL AND v_last_date IS NOT NULL THEN
        v_days_between := EXTRACT(EPOCH FROM (v_last_date - v_first_date)) / 86400 / (v_delivered_orders - 1);
    ELSE
        v_days_between := NULL;
    END IF;

    -- Calculate days since last order
    IF v_last_date IS NOT NULL THEN
        v_days_since := EXTRACT(EPOCH FROM (NOW() - v_last_date)) / 86400;
    ELSE
        v_days_since := NULL;
    END IF;

    -- Find most purchased product
    SELECT 
        soi.product_id,
        p.name,
        SUM(soi.quantity_bundles)
    INTO v_most_product_id, v_most_product_name, v_most_product_qty
    FROM sales_order_items soi
    JOIN sales_orders so ON soi.order_id = so.id
    JOIN products p ON soi.product_id = p.id
    WHERE so.customer_id = p_customer_id AND so.status = 'delivered'
    GROUP BY soi.product_id, p.name
    ORDER BY SUM(soi.quantity_bundles) DESC
    LIMIT 1;

    -- Determine customer segment
    IF v_total_orders = 0 THEN
        v_segment := 'new';
    ELSIF v_days_since IS NOT NULL AND v_days_since > 90 THEN
        v_segment := 'at_risk';
    ELSIF v_days_since IS NOT NULL AND v_days_since > 180 THEN
        v_segment := 'inactive';
    ELSIF v_delivered_value >= (
        SELECT PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY total_purchase_value)
        FROM customer_analytics
    ) THEN
        v_segment := 'vip';
    ELSE
        v_segment := 'regular';
    END IF;

    -- Determine risk level
    IF v_cancelled_orders > v_delivered_orders THEN
        v_risk_level := 'high';
    ELSIF v_cancelled_orders > 0 AND v_cancelled_orders::NUMERIC / v_total_orders > 0.2 THEN
        v_risk_level := 'medium';
    ELSE
        v_risk_level := 'low';
    END IF;

    -- Insert or update analytics
    INSERT INTO customer_analytics (
        customer_id,
        total_orders,
        delivered_orders,
        cancelled_orders,
        reserved_orders,
        total_purchase_value,
        delivered_value,
        average_order_value,
        first_purchase_date,
        last_purchase_date,
        average_days_between_orders,
        days_since_last_order,
        most_purchased_product_id,
        most_purchased_product_name,
        most_purchased_product_quantity,
        customer_segment,
        risk_level,
        last_calculated_at,
        updated_at
    ) VALUES (
        p_customer_id,
        v_total_orders,
        v_delivered_orders,
        v_cancelled_orders,
        v_reserved_orders,
        v_total_value,
        v_delivered_value,
        v_avg_order_value,
        v_first_date,
        v_last_date,
        v_days_between,
        v_days_since,
        v_most_product_id,
        v_most_product_name,
        v_most_product_qty,
        v_segment,
        v_risk_level,
        NOW(),
        NOW()
    )
    ON CONFLICT (customer_id) DO UPDATE SET
        total_orders = EXCLUDED.total_orders,
        delivered_orders = EXCLUDED.delivered_orders,
        cancelled_orders = EXCLUDED.cancelled_orders,
        reserved_orders = EXCLUDED.reserved_orders,
        total_purchase_value = EXCLUDED.total_purchase_value,
        delivered_value = EXCLUDED.delivered_value,
        average_order_value = EXCLUDED.average_order_value,
        first_purchase_date = EXCLUDED.first_purchase_date,
        last_purchase_date = EXCLUDED.last_purchase_date,
        average_days_between_orders = EXCLUDED.average_days_between_orders,
        days_since_last_order = EXCLUDED.days_since_last_order,
        most_purchased_product_id = EXCLUDED.most_purchased_product_id,
        most_purchased_product_name = EXCLUDED.most_purchased_product_name,
        most_purchased_product_quantity = EXCLUDED.most_purchased_product_quantity,
        customer_segment = EXCLUDED.customer_segment,
        risk_level = EXCLUDED.risk_level,
        last_calculated_at = NOW(),
        updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."calculate_customer_analytics"("p_customer_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_customer_analytics"("p_customer_id" "uuid") IS 'Calculates and updates all analytics for a specific customer in real-time';



CREATE OR REPLACE FUNCTION "public"."calculate_forecast_accuracy"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF NEW.actual_quantity IS NOT NULL AND OLD.actual_quantity IS NULL THEN
        NEW.accuracy_percentage := 100 - (ABS(NEW.actual_quantity - NEW.forecasted_quantity)::NUMERIC / 
            NULLIF(NEW.actual_quantity, 0) * 100);
        NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_forecast_accuracy"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Explicitly query the table without relying on RLS for this specific check
    -- SECURITY DEFINER functions run with the privileges of the creator (postgres)
    RETURN EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = user_id 
        AND role = 'admin' 
        AND active = true
    );
END;
$$;


ALTER FUNCTION "public"."is_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_manager"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = user_id 
        AND role IN ('admin', 'production_manager') 
        AND active = true
    );
END;
$$;


ALTER FUNCTION "public"."is_manager"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_customer_analytics"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Update analytics for the affected customer
    IF TG_OP = 'DELETE' THEN
        PERFORM calculate_customer_analytics(OLD.customer_id);
    ELSE
        PERFORM calculate_customer_analytics(NEW.customer_id);
    END IF;
    
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trigger_update_customer_analytics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_factories_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_factories_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_settings_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_settings_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_profiles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_profiles_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_product_raw_material_factory"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- If raw_material_id is NULL, allow it
    IF NEW.raw_material_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Check if raw material belongs to the same factory
    IF NOT EXISTS (
        SELECT 1 
        FROM raw_materials 
        WHERE id = NEW.raw_material_id 
        AND factory_id = NEW.factory_id
    ) THEN
        RAISE EXCEPTION 'Raw material must belong to the same factory as the product';
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_product_raw_material_factory"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."customer_analytics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "total_orders" integer DEFAULT 0,
    "total_purchase_value" numeric DEFAULT 0,
    "average_order_value" numeric DEFAULT 0,
    "delivered_orders" integer DEFAULT 0,
    "delivered_value" numeric DEFAULT 0,
    "cancelled_orders" integer DEFAULT 0,
    "reserved_orders" integer DEFAULT 0,
    "first_purchase_date" timestamp with time zone,
    "last_purchase_date" timestamp with time zone,
    "average_days_between_orders" numeric,
    "days_since_last_order" integer,
    "most_purchased_product_id" "uuid",
    "most_purchased_product_name" "text",
    "most_purchased_product_quantity" integer DEFAULT 0,
    "customer_segment" "text" DEFAULT 'new'::"text",
    "is_active" boolean DEFAULT true,
    "risk_level" "text" DEFAULT 'low'::"text",
    "last_calculated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "customer_analytics_customer_segment_check" CHECK (("customer_segment" = ANY (ARRAY['vip'::"text", 'regular'::"text", 'at_risk'::"text", 'new'::"text", 'inactive'::"text"]))),
    CONSTRAINT "customer_analytics_risk_level_check" CHECK (("risk_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."customer_analytics" OWNER TO "postgres";


COMMENT ON TABLE "public"."customer_analytics" IS 'Stores aggregated analytics data for each customer, calculated in real-time';



COMMENT ON COLUMN "public"."customer_analytics"."days_since_last_order" IS 'Number of days since last order, used for at-risk detection';



COMMENT ON COLUMN "public"."customer_analytics"."customer_segment" IS 'Auto-calculated segment: vip, regular, at_risk, new, inactive';



CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "type" "text" DEFAULT 'permanent'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "pincode" "text",
    "gstin" "text",
    "credit_limit" numeric DEFAULT 0,
    "payment_terms" "text" DEFAULT 'immediate'::"text",
    "is_active" boolean DEFAULT true,
    "tags" "text"[],
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "customers_payment_terms_check" CHECK (("payment_terms" = ANY (ARRAY['immediate'::"text", 'net_15'::"text", 'net_30'::"text", 'net_60'::"text"]))),
    CONSTRAINT "customers_type_check" CHECK (("type" = ANY (ARRAY['permanent'::"text", 'seasonal'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."customers"."gstin" IS 'GST Identification Number for business customers';



COMMENT ON COLUMN "public"."customers"."credit_limit" IS 'Maximum credit limit allowed for this customer';



COMMENT ON COLUMN "public"."customers"."payment_terms" IS 'Default payment terms for this customer';



CREATE OR REPLACE VIEW "public"."at_risk_customers" WITH ("security_invoker"='true') AS
 SELECT "c"."id",
    "c"."name",
    "c"."phone",
    "c"."type",
    "c"."notes",
    "c"."created_at",
    "c"."email",
    "c"."address",
    "c"."city",
    "c"."state",
    "c"."pincode",
    "c"."gstin",
    "c"."credit_limit",
    "c"."payment_terms",
    "c"."is_active",
    "c"."tags",
    "c"."updated_at",
    "ca"."days_since_last_order",
    "ca"."total_purchase_value",
    "ca"."last_purchase_date"
   FROM ("public"."customers" "c"
     JOIN "public"."customer_analytics" "ca" ON (("c"."id" = "ca"."customer_id")))
  WHERE ("ca"."customer_segment" = 'at_risk'::"text")
  ORDER BY "ca"."days_since_last_order" DESC;


ALTER VIEW "public"."at_risk_customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "details" "jsonb",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cap_production_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cap_id" "uuid" NOT NULL,
    "factory_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "shift_number" integer NOT NULL,
    "start_time" "text" NOT NULL,
    "end_time" "text" NOT NULL,
    "total_weight_produced_kg" numeric NOT NULL,
    "actual_cycle_time_seconds" numeric NOT NULL,
    "calculated_quantity" integer NOT NULL,
    "remarks" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "total_produced" integer,
    "actual_weight_grams" numeric
);


ALTER TABLE "public"."cap_production_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cap_production_logs"."actual_cycle_time_seconds" IS 'The actual cycle time in seconds recorded from the machine';



COMMENT ON COLUMN "public"."cap_production_logs"."total_produced" IS 'Manual unit count entered by user. If null, use calculated_quantity.';



COMMENT ON COLUMN "public"."cap_production_logs"."actual_weight_grams" IS 'The measured weight per unit in grams for this production session';



CREATE TABLE IF NOT EXISTS "public"."cap_stock_balances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cap_id" "uuid" NOT NULL,
    "factory_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "last_updated" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cap_stock_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cap_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "ideal_weight_grams" numeric(10,2) NOT NULL,
    "factory_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "raw_material_id" "uuid",
    "ideal_cycle_time_seconds" numeric(10,2) DEFAULT 0.0,
    CONSTRAINT "cap_templates_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."cap_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cap_templates"."raw_material_id" IS 'Default raw material for this cap template';



COMMENT ON COLUMN "public"."cap_templates"."ideal_cycle_time_seconds" IS 'Ideal machine cycle time for this cap template';



CREATE TABLE IF NOT EXISTS "public"."caps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "ideal_weight_grams" numeric NOT NULL,
    "ideal_cycle_time_seconds" numeric DEFAULT 0 NOT NULL,
    "factory_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "color" "text",
    "raw_material_id" "uuid",
    "template_id" "uuid",
    "machine_id" "uuid"
);


ALTER TABLE "public"."caps" OWNER TO "postgres";


COMMENT ON COLUMN "public"."caps"."ideal_cycle_time_seconds" IS 'Specific ideal cycle time for this cap variant';



COMMENT ON COLUMN "public"."caps"."raw_material_id" IS 'Specific raw material for this cap variant';



CREATE TABLE IF NOT EXISTS "public"."cash_flow_categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "is_system" boolean DEFAULT false,
    "is_default" boolean DEFAULT false,
    "is_recurring" boolean DEFAULT false,
    "factory_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "default_amount" numeric DEFAULT 0,
    "is_shared" boolean DEFAULT false,
    CONSTRAINT "cash_flow_categories_type_check" CHECK (("type" = ANY (ARRAY['income'::"text", 'expense'::"text"])))
);


ALTER TABLE "public"."cash_flow_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_flow_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "category_id" "uuid" NOT NULL,
    "factory_id" "uuid",
    "amount" numeric(15,2) DEFAULT 0.00 NOT NULL,
    "payment_mode" "text" DEFAULT 'Cash'::"text" NOT NULL,
    "reference_id" "uuid",
    "notes" "text",
    "is_automatic" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cash_flow_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "interaction_type" "text" NOT NULL,
    "description" "text",
    "metadata" "jsonb",
    "performed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "customer_interactions_interaction_type_check" CHECK (("interaction_type" = ANY (ARRAY['order_placed'::"text", 'order_delivered'::"text", 'order_cancelled'::"text", 'note_added'::"text", 'profile_updated'::"text", 'contact_made'::"text", 'payment_received'::"text", 'credit_limit_changed'::"text"])))
);


ALTER TABLE "public"."customer_interactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."customer_interactions" IS 'Tracks all customer interactions and touchpoints for complete activity history';



COMMENT ON COLUMN "public"."customer_interactions"."metadata" IS 'JSON field for flexible data storage (order_id, amount, notes, etc.)';



CREATE TABLE IF NOT EXISTS "public"."demand_analytics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "period_type" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "total_quantity_sold" integer DEFAULT 0 NOT NULL,
    "total_orders" integer DEFAULT 0 NOT NULL,
    "average_order_size" numeric,
    "growth_rate_percentage" numeric,
    "is_seasonal_spike" boolean DEFAULT false,
    "confidence_score" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "demand_analytics_confidence_score_check" CHECK ((("confidence_score" >= (0)::numeric) AND ("confidence_score" <= (100)::numeric))),
    CONSTRAINT "demand_analytics_period_type_check" CHECK (("period_type" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text"])))
);


ALTER TABLE "public"."demand_analytics" OWNER TO "postgres";


COMMENT ON TABLE "public"."demand_analytics" IS 'Aggregated sales demand data for analytics and pattern detection';



COMMENT ON COLUMN "public"."demand_analytics"."period_type" IS 'Aggregation level: daily, weekly, or monthly';



COMMENT ON COLUMN "public"."demand_analytics"."is_seasonal_spike" IS 'Auto-flagged if demand exceeds avg + 1.5 * std_dev';



COMMENT ON COLUMN "public"."demand_analytics"."confidence_score" IS 'Statistical confidence in the data (0-100)';



CREATE TABLE IF NOT EXISTS "public"."demand_forecasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "forecast_date" "date" NOT NULL,
    "forecast_horizon_months" integer NOT NULL,
    "forecasted_quantity" integer NOT NULL,
    "forecast_method" "text" NOT NULL,
    "actual_quantity" integer,
    "accuracy_percentage" numeric,
    "confidence_interval_lower" integer,
    "confidence_interval_upper" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "demand_forecasts_forecast_horizon_months_check" CHECK (("forecast_horizon_months" > 0)),
    CONSTRAINT "demand_forecasts_forecast_method_check" CHECK (("forecast_method" = ANY (ARRAY['SMA'::"text", 'WMA'::"text", 'seasonal'::"text", 'hybrid'::"text"]))),
    CONSTRAINT "demand_forecasts_forecasted_quantity_check" CHECK (("forecasted_quantity" >= 0))
);


ALTER TABLE "public"."demand_forecasts" OWNER TO "postgres";


COMMENT ON TABLE "public"."demand_forecasts" IS 'Demand forecasts with accuracy tracking';



COMMENT ON COLUMN "public"."demand_forecasts"."forecast_method" IS 'SMA (Simple Moving Average), WMA (Weighted), seasonal, or hybrid';



COMMENT ON COLUMN "public"."demand_forecasts"."actual_quantity" IS 'Filled after forecast_date passes for accuracy calculation';



COMMENT ON COLUMN "public"."demand_forecasts"."accuracy_percentage" IS 'Calculated as: 100 - (|actual - forecast| / actual * 100)';



CREATE TABLE IF NOT EXISTS "public"."factories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "location" "text",
    "machine_count" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "contact_person" "text",
    "contact_phone" "text",
    "contact_email" "text"
);


ALTER TABLE "public"."factories" OWNER TO "postgres";


COMMENT ON TABLE "public"."factories" IS 'Master list of factory locations';



CREATE TABLE IF NOT EXISTS "public"."inventory_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "from_state" "public"."inventory_state",
    "to_state" "public"."inventory_state",
    "quantity" numeric NOT NULL,
    "reference_id" "uuid",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "unit_type" "text" DEFAULT 'bundle'::"text",
    "transaction_type" "text",
    "factory_id" "uuid",
    "cost_per_kg" numeric,
    "total_cost" numeric,
    "raw_material_id" "uuid"
);


ALTER TABLE "public"."inventory_transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."inventory_transactions"."cost_per_kg" IS 'The rate per kilo recorded for this transaction';



COMMENT ON COLUMN "public"."inventory_transactions"."total_cost" IS 'Calculated total cost for the transaction (quantity_kg * cost_per_kg)';



CREATE TABLE IF NOT EXISTS "public"."machine_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "machine_id" "uuid",
    "product_id" "uuid",
    "ideal_cycle_time_seconds" numeric NOT NULL,
    "capacity_restriction" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "enabled" boolean DEFAULT true NOT NULL,
    "product_template_id" "uuid"
);


ALTER TABLE "public"."machine_products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."machine_products"."ideal_cycle_time_seconds" IS 'Gold Standard speed set by Admin';



COMMENT ON COLUMN "public"."machine_products"."enabled" IS 'Whether this mapping is currently active/allowed';



CREATE TABLE IF NOT EXISTS "public"."machines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'small'::"text" NOT NULL,
    "max_die_weight" numeric,
    "daily_running_cost" numeric DEFAULT 7000 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "type" "text" DEFAULT 'extruder'::"text" NOT NULL,
    "factory_id" "uuid" NOT NULL,
    CONSTRAINT "machines_category_check" CHECK (("category" = ANY (ARRAY['small'::"text", 'large'::"text", 'other'::"text"]))),
    CONSTRAINT "machines_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"]))),
    CONSTRAINT "machines_type_check" CHECK (("type" = ANY (ARRAY['extruder'::"text", 'cutting'::"text", 'printing'::"text", 'packing'::"text"])))
);


ALTER TABLE "public"."machines" OWNER TO "postgres";


COMMENT ON TABLE "public"."machines" IS 'Master list of 8 production machines';



COMMENT ON COLUMN "public"."machines"."daily_running_cost" IS 'Used for daily cost recovery calculation';



COMMENT ON COLUMN "public"."machines"."type" IS 'Type of machine (extruder, cutting, printing, packing)';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."packing_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "factory_id" "uuid" NOT NULL,
    "unit_name" "text" NOT NULL,
    "has_packets" boolean DEFAULT true NOT NULL,
    "items_per_packet" integer,
    "packets_per_unit" integer,
    "items_per_unit" integer,
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."packing_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sales_order_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "payment_date" timestamp with time zone DEFAULT "now"(),
    "payment_method" "text",
    "notes" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payments_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."payments" IS 'Payment history for sales orders (supports partial payments)';



COMMENT ON COLUMN "public"."payments"."sales_order_id" IS 'Reference to the sales order';



COMMENT ON COLUMN "public"."payments"."customer_id" IS 'Reference to the customer (denormalized for quick queries)';



COMMENT ON COLUMN "public"."payments"."amount" IS 'Amount paid in this transaction';



COMMENT ON COLUMN "public"."payments"."payment_date" IS 'Date when payment was received';



COMMENT ON COLUMN "public"."payments"."payment_method" IS 'Payment method (e.g., Cash, Bank Transfer, Cheque)';



COMMENT ON COLUMN "public"."payments"."recorded_by" IS 'User who recorded this payment';



CREATE TABLE IF NOT EXISTS "public"."product_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "size" "text" NOT NULL,
    "weight_grams" numeric(10,2) NOT NULL,
    "items_per_packet" integer DEFAULT 100,
    "packets_per_bundle" integer DEFAULT 50,
    "factory_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "cap_template_id" "uuid",
    "packets_per_bag" integer DEFAULT 0,
    "items_per_bag" integer DEFAULT 0,
    "packets_per_box" integer DEFAULT 0,
    "items_per_box" integer DEFAULT 0,
    "bundle_enabled" boolean DEFAULT true,
    "bag_enabled" boolean DEFAULT false,
    "box_enabled" boolean DEFAULT false,
    "items_per_bundle" integer,
    "selling_price" numeric,
    "raw_material_id" "uuid",
    CONSTRAINT "product_templates_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."product_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."product_templates"."cap_template_id" IS 'Link to the cap template used for all variants of this product';



COMMENT ON COLUMN "public"."product_templates"."items_per_bundle" IS 'Default number of loose items per bundle for variants of this template';



COMMENT ON COLUMN "public"."product_templates"."selling_price" IS 'Default selling price in INR for variants of this template';



COMMENT ON COLUMN "public"."product_templates"."raw_material_id" IS 'Default raw material used for all variants of this template';



CREATE TABLE IF NOT EXISTS "public"."production_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "machine_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "shift_hours" numeric DEFAULT 23 NOT NULL,
    "actual_quantity" integer NOT NULL,
    "theoretical_quantity" integer NOT NULL,
    "efficiency_percentage" numeric NOT NULL,
    "waste_weight_grams" numeric DEFAULT 0,
    "is_cost_recovered" boolean DEFAULT false,
    "status" "text" DEFAULT 'submitted'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "shift_number" integer,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "total_produced" integer,
    "damaged_count" integer DEFAULT 0,
    "actual_cycle_time_seconds" numeric,
    "actual_weight_grams" numeric,
    "downtime_minutes" integer,
    "downtime_reason" "text",
    "units_lost_to_cycle" integer,
    "weight_wastage_kg" numeric,
    "flagged_for_review" boolean DEFAULT false,
    "total_weight_kg" numeric,
    "factory_id" "uuid" NOT NULL,
    CONSTRAINT "production_logs_actual_quantity_check" CHECK (("actual_quantity" >= 0)),
    CONSTRAINT "production_logs_shift_number_check" CHECK (("shift_number" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "production_logs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'submitted'::"text", 'verified'::"text"])))
);


ALTER TABLE "public"."production_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."production_logs" IS 'Daily production entries. Immutable after verification.';



COMMENT ON COLUMN "public"."production_logs"."user_id" IS 'The production manager who submitted this production entry';



COMMENT ON COLUMN "public"."production_logs"."shift_number" IS '1 = 8AM-8PM (Day), 2 = 8PM-8AM (Night)';



COMMENT ON COLUMN "public"."production_logs"."actual_cycle_time_seconds" IS 'Observed cycle time from machine display';



COMMENT ON COLUMN "public"."production_logs"."actual_weight_grams" IS 'Measured weight per unit during production';



COMMENT ON COLUMN "public"."production_logs"."downtime_minutes" IS 'Calculated: Shift duration - actual production time';



COMMENT ON COLUMN "public"."production_logs"."downtime_reason" IS 'Required if downtime > 30 mins: Die Change, Power Cut, Maintenance, Other';



COMMENT ON COLUMN "public"."production_logs"."units_lost_to_cycle" IS 'Calculated: Units lost due to slower cycle time';



COMMENT ON COLUMN "public"."production_logs"."flagged_for_review" IS 'Auto-flagged if actual_cycle_time > ideal * 1.05';



COMMENT ON COLUMN "public"."production_logs"."total_weight_kg" IS 'For weight-based products (caps): total weight produced';



CREATE TABLE IF NOT EXISTS "public"."production_recommendations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "target_month" "date" NOT NULL,
    "recommended_quantity" integer NOT NULL,
    "current_stock_level" integer,
    "average_monthly_sales" integer,
    "trend_adjustment_percentage" numeric,
    "seasonal_adjustment_percentage" numeric,
    "reasoning" "text" NOT NULL,
    "confidence_score" numeric,
    "status" "text" DEFAULT 'pending'::"text",
    "accepted_by" "uuid",
    "accepted_at" timestamp with time zone,
    "adjusted_quantity" integer,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "production_recommendations_confidence_score_check" CHECK ((("confidence_score" >= (0)::numeric) AND ("confidence_score" <= (100)::numeric))),
    CONSTRAINT "production_recommendations_recommended_quantity_check" CHECK (("recommended_quantity" >= 0)),
    CONSTRAINT "production_recommendations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."production_recommendations" OWNER TO "postgres";


COMMENT ON TABLE "public"."production_recommendations" IS 'AI-generated production quantity recommendations';



COMMENT ON COLUMN "public"."production_recommendations"."target_month" IS 'First day of the month for which recommendation is made';



COMMENT ON COLUMN "public"."production_recommendations"."reasoning" IS 'Human-readable explanation of the recommendation';



COMMENT ON COLUMN "public"."production_recommendations"."status" IS 'pending (awaiting review), accepted, or rejected';



COMMENT ON COLUMN "public"."production_recommendations"."adjusted_quantity" IS 'User-adjusted quantity if they modify the recommendation';



CREATE TABLE IF NOT EXISTS "public"."production_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "factory_id" "uuid",
    "quantity" integer NOT NULL,
    "unit_type" "text" NOT NULL,
    "sales_order_id" "uuid",
    "status" "public"."production_request_status" DEFAULT 'pending'::"public"."production_request_status",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."production_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "size" "text" NOT NULL,
    "color" "text" NOT NULL,
    "weight_grams" numeric(10,2) NOT NULL,
    "items_per_packet" integer DEFAULT 100,
    "packets_per_bundle" integer DEFAULT 50,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sku" "text",
    "selling_price" numeric(10,2),
    "counting_method" "text" DEFAULT 'unit_count'::"text",
    "factory_id" "uuid" NOT NULL,
    "raw_material_id" "uuid",
    "items_per_bundle" integer,
    "cap_id" "uuid",
    "template_id" "uuid",
    "packets_per_bag" integer DEFAULT 0,
    "items_per_bag" integer DEFAULT 0,
    "packets_per_box" integer DEFAULT 0,
    "items_per_box" integer DEFAULT 0,
    "bundle_enabled" boolean DEFAULT true,
    "bag_enabled" boolean DEFAULT false,
    "box_enabled" boolean DEFAULT false,
    "cap_template_id" "uuid",
    CONSTRAINT "products_counting_method_check" CHECK (("counting_method" = ANY (ARRAY['unit_count'::"text", 'weight_based'::"text"]))),
    CONSTRAINT "products_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."weight_grams" IS 'Weight in grams, used to deduct from Raw Material stock';



COMMENT ON COLUMN "public"."products"."sku" IS 'Stock Keeping Unit - unique product identifier';



COMMENT ON COLUMN "public"."products"."selling_price" IS 'Selling price per item in INR';



COMMENT ON COLUMN "public"."products"."counting_method" IS 'unit_count = normal, weight_based = caps (count by weight)';



COMMENT ON COLUMN "public"."products"."raw_material_id" IS 'Raw material used for this product. Must belong to the same factory.';



COMMENT ON COLUMN "public"."products"."items_per_bundle" IS 'Number of loose items per bundle when skipping packet stage';



COMMENT ON COLUMN "public"."products"."cap_id" IS 'DEPRECATED: Use product_templates.cap_template_id for mapping instead';



COMMENT ON COLUMN "public"."products"."cap_template_id" IS 'Link to the cap template used for this product variant (propagated from parent template)';



CREATE TABLE IF NOT EXISTS "public"."raw_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "stock_weight_kg" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "type" "text" DEFAULT 'Granule'::"text",
    "min_threshold_kg" numeric DEFAULT 100,
    "factory_id" "uuid" NOT NULL,
    "bag_weight_kg" numeric DEFAULT 25 NOT NULL,
    "last_cost_per_kg" numeric
);


ALTER TABLE "public"."raw_materials" OWNER TO "postgres";


COMMENT ON COLUMN "public"."raw_materials"."bag_weight_kg" IS 'Configurable weight of a single bag in kg (used for conversions)';



COMMENT ON COLUMN "public"."raw_materials"."last_cost_per_kg" IS 'Last recorded purchase price per kilogram';



CREATE TABLE IF NOT EXISTS "public"."sales_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid",
    "product_id" "uuid" NOT NULL,
    "quantity_bundles" integer,
    "unit_price" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "unit_type" "text" DEFAULT 'bundle'::"text",
    "quantity" integer NOT NULL,
    "is_backordered" boolean DEFAULT false,
    "is_prepared" boolean DEFAULT false NOT NULL,
    "prepared_at" timestamp with time zone,
    "prepared_by" "uuid"
);


ALTER TABLE "public"."sales_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "order_date" "date" DEFAULT CURRENT_DATE,
    "status" "text" DEFAULT 'reserved'::"text" NOT NULL,
    "total_amount" numeric,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "delivered_at" timestamp with time zone,
    "delivery_date" "date",
    "payment_mode" "text",
    "subtotal" numeric(10,2),
    "discount_type" "text",
    "discount_value" numeric(10,2),
    "amount_paid" numeric(10,2) DEFAULT 0,
    "balance_due" numeric(10,2),
    "credit_deadline" "date",
    "is_overdue" boolean DEFAULT false,
    CONSTRAINT "sales_orders_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed'::"text"]))),
    CONSTRAINT "sales_orders_payment_mode_check" CHECK (("payment_mode" = ANY (ARRAY['cash'::"text", 'credit'::"text"]))),
    CONSTRAINT "sales_orders_status_check" CHECK (("status" = ANY (ARRAY['reserved'::"text", 'delivered'::"text", 'cancelled'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."sales_orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."sales_orders"."total_amount" IS 'Final total after discount (subtotal - discount)';



COMMENT ON COLUMN "public"."sales_orders"."delivered_at" IS 'Timestamp when the order was marked as delivered';



COMMENT ON COLUMN "public"."sales_orders"."payment_mode" IS 'Payment mode: cash or credit';



COMMENT ON COLUMN "public"."sales_orders"."subtotal" IS 'Sum of all item prices before discount';



COMMENT ON COLUMN "public"."sales_orders"."discount_type" IS 'Type of discount: percentage or fixed amount';



COMMENT ON COLUMN "public"."sales_orders"."discount_value" IS 'Discount value (percentage 0-100 or fixed amount)';



COMMENT ON COLUMN "public"."sales_orders"."amount_paid" IS 'Total amount paid so far (for partial payments)';



COMMENT ON COLUMN "public"."sales_orders"."balance_due" IS 'Remaining balance (total_amount - amount_paid)';



COMMENT ON COLUMN "public"."sales_orders"."credit_deadline" IS 'Deadline for credit payment (manual entry)';



COMMENT ON COLUMN "public"."sales_orders"."is_overdue" IS 'Auto-flagged when credit_deadline is passed and balance > 0';



CREATE TABLE IF NOT EXISTS "public"."seasonal_patterns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "pattern_name" "text",
    "start_month" integer,
    "end_month" integer,
    "start_day" integer,
    "end_day" integer,
    "demand_multiplier" numeric NOT NULL,
    "confidence_score" numeric,
    "detection_method" "text" DEFAULT 'auto'::"text",
    "years_detected" integer[],
    "notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "seasonal_patterns_confidence_score_check" CHECK ((("confidence_score" >= (0)::numeric) AND ("confidence_score" <= (100)::numeric))),
    CONSTRAINT "seasonal_patterns_demand_multiplier_check" CHECK (("demand_multiplier" > (0)::numeric)),
    CONSTRAINT "seasonal_patterns_detection_method_check" CHECK (("detection_method" = ANY (ARRAY['auto'::"text", 'manual'::"text"]))),
    CONSTRAINT "seasonal_patterns_end_day_check" CHECK ((("end_day" >= 1) AND ("end_day" <= 31))),
    CONSTRAINT "seasonal_patterns_end_month_check" CHECK ((("end_month" >= 1) AND ("end_month" <= 12))),
    CONSTRAINT "seasonal_patterns_start_day_check" CHECK ((("start_day" >= 1) AND ("start_day" <= 31))),
    CONSTRAINT "seasonal_patterns_start_month_check" CHECK ((("start_month" >= 1) AND ("start_month" <= 12)))
);


ALTER TABLE "public"."seasonal_patterns" OWNER TO "postgres";


COMMENT ON TABLE "public"."seasonal_patterns" IS 'Detected seasonal demand patterns (festivals, celebrations, etc.)';



COMMENT ON COLUMN "public"."seasonal_patterns"."pattern_name" IS 'Auto-generated or manual name (e.g., "August Spike", "Festival Season")';



COMMENT ON COLUMN "public"."seasonal_patterns"."demand_multiplier" IS 'Multiplier for demand (e.g., 1.8 = 80% increase)';



COMMENT ON COLUMN "public"."seasonal_patterns"."detection_method" IS 'How pattern was detected: auto (algorithm) or manual (user-defined)';



COMMENT ON COLUMN "public"."seasonal_patterns"."years_detected" IS 'Array of years when this pattern was observed';



CREATE TABLE IF NOT EXISTS "public"."stock_balances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "state" "public"."inventory_state" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "last_updated" timestamp with time zone DEFAULT "now"(),
    "factory_id" "uuid" NOT NULL,
    "cap_id" "uuid",
    "unit_type" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."stock_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "purchase_id" "uuid" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "payment_method" "text" DEFAULT 'Cash'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."supplier_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" character varying(50) NOT NULL,
    "key" character varying(100) NOT NULL,
    "value_text" "text",
    "value_number" numeric(10,2),
    "value_boolean" boolean,
    "value_json" "jsonb",
    "data_type" character varying(20) NOT NULL,
    "display_name" character varying(255) NOT NULL,
    "description" "text",
    "ui_input_type" character varying(50),
    "ui_options" "jsonb",
    "min_value" numeric(10,2),
    "max_value" numeric(10,2),
    "is_required" boolean DEFAULT true,
    "is_editable" boolean DEFAULT true,
    "requires_restart" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    CONSTRAINT "system_settings_data_type_check" CHECK ((("data_type")::"text" = ANY ((ARRAY['text'::character varying, 'number'::character varying, 'boolean'::character varying, 'json'::character varying])::"text"[])))
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "name" "text",
    "factory_id" "uuid",
    CONSTRAINT "user_profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'production_manager'::"text"])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_profiles"."factory_id" IS 'NULL for admin (access all factories), specific UUID for production_manager';



CREATE TABLE IF NOT EXISTS "public"."user_push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['android'::"text", 'ios'::"text"])))
);


ALTER TABLE "public"."user_push_tokens" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vip_customers" WITH ("security_invoker"='true') AS
 SELECT "c"."id",
    "c"."name",
    "c"."phone",
    "c"."type",
    "c"."notes",
    "c"."created_at",
    "c"."email",
    "c"."address",
    "c"."city",
    "c"."state",
    "c"."pincode",
    "c"."gstin",
    "c"."credit_limit",
    "c"."payment_terms",
    "c"."is_active",
    "c"."tags",
    "c"."updated_at",
    "ca"."total_purchase_value",
    "ca"."total_orders",
    "ca"."last_purchase_date"
   FROM ("public"."customers" "c"
     JOIN "public"."customer_analytics" "ca" ON (("c"."id" = "ca"."customer_id")))
  WHERE ("ca"."customer_segment" = 'vip'::"text")
  ORDER BY "ca"."total_purchase_value" DESC;


ALTER VIEW "public"."vip_customers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cap_production_logs"
    ADD CONSTRAINT "cap_production_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cap_stock_balances"
    ADD CONSTRAINT "cap_stock_balances_cap_id_factory_id_key" UNIQUE ("cap_id", "factory_id");



ALTER TABLE ONLY "public"."cap_stock_balances"
    ADD CONSTRAINT "cap_stock_balances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cap_templates"
    ADD CONSTRAINT "cap_templates_name_factory_id_key" UNIQUE ("name", "factory_id");



ALTER TABLE ONLY "public"."cap_templates"
    ADD CONSTRAINT "cap_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."caps"
    ADD CONSTRAINT "caps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_flow_categories"
    ADD CONSTRAINT "cash_flow_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_flow_logs"
    ADD CONSTRAINT "cash_flow_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_analytics"
    ADD CONSTRAINT "customer_analytics_customer_id_key" UNIQUE ("customer_id");



ALTER TABLE ONLY "public"."customer_analytics"
    ADD CONSTRAINT "customer_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_interactions"
    ADD CONSTRAINT "customer_interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demand_analytics"
    ADD CONSTRAINT "demand_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demand_analytics"
    ADD CONSTRAINT "demand_analytics_product_id_period_type_period_start_key" UNIQUE ("product_id", "period_type", "period_start");



ALTER TABLE ONLY "public"."demand_forecasts"
    ADD CONSTRAINT "demand_forecasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."factories"
    ADD CONSTRAINT "factories_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."factories"
    ADD CONSTRAINT "factories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."factories"
    ADD CONSTRAINT "factories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."machine_products"
    ADD CONSTRAINT "machine_products_machine_id_template_key" UNIQUE ("machine_id", "product_template_id");



ALTER TABLE ONLY "public"."machine_products"
    ADD CONSTRAINT "machine_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."machines"
    ADD CONSTRAINT "machines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."packing_rules"
    ADD CONSTRAINT "packing_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_templates"
    ADD CONSTRAINT "product_templates_name_size_factory_id_key" UNIQUE ("name", "size", "factory_id");



ALTER TABLE ONLY "public"."product_templates"
    ADD CONSTRAINT "product_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_logs"
    ADD CONSTRAINT "production_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_recommendations"
    ADD CONSTRAINT "production_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_requests"
    ADD CONSTRAINT "production_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."raw_materials"
    ADD CONSTRAINT "raw_materials_name_factory_key" UNIQUE ("name", "factory_id");



ALTER TABLE ONLY "public"."raw_materials"
    ADD CONSTRAINT "raw_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_order_items"
    ADD CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seasonal_patterns"
    ADD CONSTRAINT "seasonal_patterns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_balances"
    ADD CONSTRAINT "stock_balances_identity_unique" UNIQUE NULLS NOT DISTINCT ("product_id", "factory_id", "state", "unit_type", "cap_id");



ALTER TABLE ONLY "public"."stock_balances"
    ADD CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_user_id_token_key" UNIQUE ("user_id", "token");



CREATE INDEX "idx_audit_logs_action" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at");



CREATE INDEX "idx_audit_logs_user_id" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_cap_templates_raw_material" ON "public"."cap_templates" USING "btree" ("raw_material_id");



CREATE INDEX "idx_caps_raw_material" ON "public"."caps" USING "btree" ("raw_material_id");



CREATE INDEX "idx_cash_flow_logs_category" ON "public"."cash_flow_logs" USING "btree" ("category_id");



CREATE INDEX "idx_cash_flow_logs_date" ON "public"."cash_flow_logs" USING "btree" ("date");



CREATE INDEX "idx_cash_flow_logs_factory" ON "public"."cash_flow_logs" USING "btree" ("factory_id");



CREATE INDEX "idx_customer_analytics_customer_id" ON "public"."customer_analytics" USING "btree" ("customer_id");



CREATE INDEX "idx_customer_analytics_last_purchase" ON "public"."customer_analytics" USING "btree" ("last_purchase_date" DESC);



CREATE INDEX "idx_customer_analytics_segment" ON "public"."customer_analytics" USING "btree" ("customer_segment");



CREATE INDEX "idx_customer_analytics_total_value" ON "public"."customer_analytics" USING "btree" ("total_purchase_value" DESC);



CREATE INDEX "idx_customer_interactions_created_at" ON "public"."customer_interactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_customer_interactions_customer_id" ON "public"."customer_interactions" USING "btree" ("customer_id");



CREATE INDEX "idx_customer_interactions_performed_by" ON "public"."customer_interactions" USING "btree" ("performed_by");



CREATE INDEX "idx_customer_interactions_type" ON "public"."customer_interactions" USING "btree" ("interaction_type");



CREATE INDEX "idx_customers_email" ON "public"."customers" USING "btree" ("email");



CREATE INDEX "idx_customers_is_active" ON "public"."customers" USING "btree" ("is_active");



CREATE INDEX "idx_customers_tags" ON "public"."customers" USING "gin" ("tags");



CREATE INDEX "idx_demand_analytics_period_type" ON "public"."demand_analytics" USING "btree" ("period_type", "period_start");



CREATE INDEX "idx_demand_analytics_product_period" ON "public"."demand_analytics" USING "btree" ("product_id", "period_start");



CREATE INDEX "idx_demand_analytics_seasonal" ON "public"."demand_analytics" USING "btree" ("is_seasonal_spike") WHERE ("is_seasonal_spike" = true);



CREATE INDEX "idx_demand_forecasts_date" ON "public"."demand_forecasts" USING "btree" ("forecast_date");



CREATE INDEX "idx_demand_forecasts_method" ON "public"."demand_forecasts" USING "btree" ("forecast_method");



CREATE INDEX "idx_demand_forecasts_product_date" ON "public"."demand_forecasts" USING "btree" ("product_id", "forecast_date");



CREATE INDEX "idx_factories_active" ON "public"."factories" USING "btree" ("active");



CREATE INDEX "idx_factories_code" ON "public"."factories" USING "btree" ("code");



CREATE INDEX "idx_machines_factory" ON "public"."machines" USING "btree" ("factory_id");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_packing_rules_product_factory" ON "public"."packing_rules" USING "btree" ("product_id", "factory_id");



CREATE INDEX "idx_payments_customer" ON "public"."payments" USING "btree" ("customer_id");



CREATE INDEX "idx_payments_date" ON "public"."payments" USING "btree" ("payment_date" DESC);



CREATE INDEX "idx_payments_sales_order" ON "public"."payments" USING "btree" ("sales_order_id");



CREATE INDEX "idx_prod_req_factory" ON "public"."production_requests" USING "btree" ("factory_id");



CREATE INDEX "idx_prod_req_product" ON "public"."production_requests" USING "btree" ("product_id");



CREATE INDEX "idx_product_templates_cap_template" ON "public"."product_templates" USING "btree" ("cap_template_id");



CREATE INDEX "idx_production_logs_date_shift" ON "public"."production_logs" USING "btree" ("date", "shift_number");



CREATE INDEX "idx_production_logs_factory" ON "public"."production_logs" USING "btree" ("factory_id");



CREATE INDEX "idx_production_logs_flagged" ON "public"."production_logs" USING "btree" ("flagged_for_review") WHERE ("flagged_for_review" = true);



CREATE INDEX "idx_production_logs_machine_date" ON "public"."production_logs" USING "btree" ("machine_id", "date");



CREATE INDEX "idx_production_logs_user_id" ON "public"."production_logs" USING "btree" ("user_id");



CREATE INDEX "idx_production_recommendations_product" ON "public"."production_recommendations" USING "btree" ("product_id");



CREATE INDEX "idx_production_recommendations_status" ON "public"."production_recommendations" USING "btree" ("status");



CREATE INDEX "idx_production_recommendations_target" ON "public"."production_recommendations" USING "btree" ("target_month", "status");



CREATE INDEX "idx_products_factory" ON "public"."products" USING "btree" ("factory_id");



CREATE INDEX "idx_products_raw_material" ON "public"."products" USING "btree" ("raw_material_id");



CREATE INDEX "idx_raw_materials_factory" ON "public"."raw_materials" USING "btree" ("factory_id");



CREATE INDEX "idx_sales_items_backordered" ON "public"."sales_order_items" USING "btree" ("is_backordered") WHERE ("is_backordered" = true);



CREATE INDEX "idx_sales_order_items_is_prepared" ON "public"."sales_order_items" USING "btree" ("is_prepared");



CREATE INDEX "idx_sales_orders_delivered_at" ON "public"."sales_orders" USING "btree" ("delivered_at");



CREATE INDEX "idx_seasonal_patterns_active" ON "public"."seasonal_patterns" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_seasonal_patterns_months" ON "public"."seasonal_patterns" USING "btree" ("start_month", "end_month");



CREATE INDEX "idx_seasonal_patterns_product" ON "public"."seasonal_patterns" USING "btree" ("product_id");



CREATE INDEX "idx_settings_category" ON "public"."system_settings" USING "btree" ("category");



CREATE INDEX "idx_settings_key" ON "public"."system_settings" USING "btree" ("key");



CREATE INDEX "idx_stock_balances_factory" ON "public"."stock_balances" USING "btree" ("factory_id");



CREATE INDEX "idx_user_profiles_active" ON "public"."user_profiles" USING "btree" ("active");



CREATE INDEX "idx_user_profiles_factory" ON "public"."user_profiles" USING "btree" ("factory_id");



CREATE INDEX "idx_user_profiles_role" ON "public"."user_profiles" USING "btree" ("role");



CREATE OR REPLACE TRIGGER "check_product_raw_material_factory" BEFORE INSERT OR UPDATE OF "raw_material_id", "factory_id" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."validate_product_raw_material_factory"();



CREATE OR REPLACE TRIGGER "settings_updated_at" BEFORE UPDATE ON "public"."system_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_settings_timestamp"();



CREATE OR REPLACE TRIGGER "trg_sales_orders_update_analytics" AFTER INSERT OR DELETE OR UPDATE ON "public"."sales_orders" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_customer_analytics"();



COMMENT ON TRIGGER "trg_sales_orders_update_analytics" ON "public"."sales_orders" IS 'Automatically updates customer analytics when orders are created, updated, or deleted';



CREATE OR REPLACE TRIGGER "trigger_calculate_forecast_accuracy" BEFORE UPDATE ON "public"."demand_forecasts" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_forecast_accuracy"();



CREATE OR REPLACE TRIGGER "trigger_demand_analytics_updated_at" BEFORE UPDATE ON "public"."demand_analytics" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_factories_updated_at" BEFORE UPDATE ON "public"."factories" FOR EACH ROW EXECUTE FUNCTION "public"."update_factories_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_production_recommendations_updated_at" BEFORE UPDATE ON "public"."production_recommendations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_seasonal_patterns_updated_at" BEFORE UPDATE ON "public"."seasonal_patterns" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_profiles_updated_at"();



CREATE OR REPLACE TRIGGER "update_packing_rules_updated_at" BEFORE UPDATE ON "public"."packing_rules" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_user_push_tokens_updated_at" BEFORE UPDATE ON "public"."user_push_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cap_production_logs"
    ADD CONSTRAINT "cap_production_logs_cap_id_fkey" FOREIGN KEY ("cap_id") REFERENCES "public"."caps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cap_production_logs"
    ADD CONSTRAINT "cap_production_logs_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cap_production_logs"
    ADD CONSTRAINT "cap_production_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cap_stock_balances"
    ADD CONSTRAINT "cap_stock_balances_cap_id_fkey" FOREIGN KEY ("cap_id") REFERENCES "public"."caps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cap_stock_balances"
    ADD CONSTRAINT "cap_stock_balances_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cap_templates"
    ADD CONSTRAINT "cap_templates_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id");



ALTER TABLE ONLY "public"."cap_templates"
    ADD CONSTRAINT "cap_templates_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id");



ALTER TABLE ONLY "public"."caps"
    ADD CONSTRAINT "caps_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."caps"
    ADD CONSTRAINT "caps_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id");



ALTER TABLE ONLY "public"."caps"
    ADD CONSTRAINT "caps_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id");



ALTER TABLE ONLY "public"."caps"
    ADD CONSTRAINT "caps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."cap_templates"("id");



ALTER TABLE ONLY "public"."cash_flow_categories"
    ADD CONSTRAINT "cash_flow_categories_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id");



ALTER TABLE ONLY "public"."cash_flow_logs"
    ADD CONSTRAINT "cash_flow_logs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."cash_flow_categories"("id");



ALTER TABLE ONLY "public"."cash_flow_logs"
    ADD CONSTRAINT "cash_flow_logs_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id");



ALTER TABLE ONLY "public"."customer_analytics"
    ADD CONSTRAINT "customer_analytics_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_analytics"
    ADD CONSTRAINT "customer_analytics_most_purchased_product_id_fkey" FOREIGN KEY ("most_purchased_product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."customer_interactions"
    ADD CONSTRAINT "customer_interactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_interactions"
    ADD CONSTRAINT "customer_interactions_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."demand_analytics"
    ADD CONSTRAINT "demand_analytics_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."demand_forecasts"
    ADD CONSTRAINT "demand_forecasts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id");



ALTER TABLE ONLY "public"."machine_products"
    ADD CONSTRAINT "machine_products_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."machine_products"
    ADD CONSTRAINT "machine_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."machine_products"
    ADD CONSTRAINT "machine_products_product_template_id_fkey" FOREIGN KEY ("product_template_id") REFERENCES "public"."product_templates"("id");



ALTER TABLE ONLY "public"."machines"
    ADD CONSTRAINT "machines_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."packing_rules"
    ADD CONSTRAINT "packing_rules_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."packing_rules"
    ADD CONSTRAINT "packing_rules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_templates"
    ADD CONSTRAINT "product_templates_cap_template_id_fkey" FOREIGN KEY ("cap_template_id") REFERENCES "public"."cap_templates"("id");



ALTER TABLE ONLY "public"."product_templates"
    ADD CONSTRAINT "product_templates_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id");



ALTER TABLE ONLY "public"."product_templates"
    ADD CONSTRAINT "product_templates_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id");



ALTER TABLE ONLY "public"."production_logs"
    ADD CONSTRAINT "production_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_logs"
    ADD CONSTRAINT "production_logs_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id");



ALTER TABLE ONLY "public"."production_logs"
    ADD CONSTRAINT "production_logs_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id");



ALTER TABLE ONLY "public"."production_logs"
    ADD CONSTRAINT "production_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."production_logs"
    ADD CONSTRAINT "production_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."production_recommendations"
    ADD CONSTRAINT "production_recommendations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."production_recommendations"
    ADD CONSTRAINT "production_recommendations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."production_requests"
    ADD CONSTRAINT "production_requests_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_requests"
    ADD CONSTRAINT "production_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_requests"
    ADD CONSTRAINT "production_requests_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_cap_id_fkey" FOREIGN KEY ("cap_id") REFERENCES "public"."caps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_cap_template_id_fkey" FOREIGN KEY ("cap_template_id") REFERENCES "public"."cap_templates"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."product_templates"("id");



ALTER TABLE ONLY "public"."raw_materials"
    ADD CONSTRAINT "raw_materials_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id");



ALTER TABLE ONLY "public"."sales_order_items"
    ADD CONSTRAINT "sales_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_order_items"
    ADD CONSTRAINT "sales_order_items_prepared_by_fkey" FOREIGN KEY ("prepared_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sales_order_items"
    ADD CONSTRAINT "sales_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."seasonal_patterns"
    ADD CONSTRAINT "seasonal_patterns_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."stock_balances"
    ADD CONSTRAINT "stock_balances_cap_id_fkey" FOREIGN KEY ("cap_id") REFERENCES "public"."caps"("id");



ALTER TABLE ONLY "public"."stock_balances"
    ADD CONSTRAINT "stock_balances_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id");



ALTER TABLE ONLY "public"."stock_balances"
    ADD CONSTRAINT "stock_balances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "public"."inventory_transactions"("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can manage all stock" ON "public"."stock_balances" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage cap_templates" ON "public"."cap_templates" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage caps" ON "public"."caps" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage cash_flow_categories" ON "public"."cash_flow_categories" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage cash_flow_logs" ON "public"."cash_flow_logs" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage customer analytics" ON "public"."customer_analytics" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage customers" ON "public"."customers" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage factories" ON "public"."factories" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage machine_products" ON "public"."machine_products" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage machines" ON "public"."machines" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage packing_rules" ON "public"."packing_rules" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage payments" ON "public"."payments" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage product_templates" ON "public"."product_templates" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage products" ON "public"."products" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage profiles" ON "public"."user_profiles" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage raw_materials" ON "public"."raw_materials" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage sales order items" ON "public"."sales_order_items" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage sales orders" ON "public"."sales_orders" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage settings" ON "public"."system_settings" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage supplier_payments" ON "public"."supplier_payments" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all production logs" ON "public"."production_logs" FOR SELECT TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all profiles" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all transactions" ON "public"."inventory_transactions" FOR SELECT TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Authenticated users can insert audit logs" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view cap_templates" ON "public"."cap_templates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view caps" ON "public"."caps" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view demand_analytics" ON "public"."demand_analytics" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view demand_forecasts" ON "public"."demand_forecasts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view factories" ON "public"."factories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view machine_products" ON "public"."machine_products" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view machines" ON "public"."machines" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view packing_rules" ON "public"."packing_rules" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view product_templates" ON "public"."product_templates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view production requests" ON "public"."production_requests" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view production_recommendations" ON "public"."production_recommendations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view products" ON "public"."products" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view raw_materials" ON "public"."raw_materials" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view seasonal_patterns" ON "public"."seasonal_patterns" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view stock balances" ON "public"."stock_balances" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authorized roles can log transactions" ON "public"."inventory_transactions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Authorized roles can manage production requests" ON "public"."production_requests" TO "authenticated" USING ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Managers can manage cap balances" ON "public"."cap_stock_balances" TO "authenticated" USING ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Managers can manage customer interactions" ON "public"."customer_interactions" TO "authenticated" USING ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Managers can view cash_flow_categories" ON "public"."cash_flow_categories" FOR SELECT TO "authenticated" USING ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Managers can view cash_flow_logs" ON "public"."cash_flow_logs" FOR SELECT TO "authenticated" USING ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Managers can view customer analytics" ON "public"."customer_analytics" FOR SELECT TO "authenticated" USING ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Managers can view customers" ON "public"."customers" FOR SELECT TO "authenticated" USING ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Managers can view payments" ON "public"."payments" FOR SELECT TO "authenticated" USING ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Managers can view supplier_payments" ON "public"."supplier_payments" FOR SELECT TO "authenticated" USING ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Production Managers can create production logs" ON "public"."production_logs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Production Managers can update inventory" ON "public"."stock_balances" FOR UPDATE TO "authenticated" USING ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Production Managers can view production logs" ON "public"."production_logs" FOR SELECT TO "authenticated" USING ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Production managers can manage production logs" ON "public"."cap_production_logs" TO "authenticated" USING ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "Production managers can view settings" ON "public"."system_settings" FOR SELECT TO "authenticated" USING ("public"."is_manager"("auth"."uid"()));



CREATE POLICY "System can manage demand_analytics" ON "public"."demand_analytics" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "System can manage demand_forecasts" ON "public"."demand_forecasts" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "System can manage notifications" ON "public"."notifications" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "System can manage production_recommendations" ON "public"."production_recommendations" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "System can manage seasonal_patterns" ON "public"."seasonal_patterns" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Users can delete their own tokens" ON "public"."user_push_tokens" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own tokens" ON "public"."user_push_tokens" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own tokens" ON "public"."user_push_tokens" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own tokens" ON "public"."user_push_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cap_production_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cap_stock_balances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cap_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."caps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_flow_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_flow_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_interactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."demand_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."demand_forecasts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."factories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."machine_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."machines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."packing_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."production_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."production_recommendations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."production_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."raw_materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seasonal_patterns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_balances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_push_tokens" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."production_logs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."raw_materials";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."sales_orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."stock_balances";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."adjust_cap_stock"("p_cap_id" "uuid", "p_factory_id" "uuid", "p_quantity_change" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_cap_stock"("p_cap_id" "uuid", "p_factory_id" "uuid", "p_quantity_change" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_cap_stock"("p_cap_id" "uuid", "p_factory_id" "uuid", "p_quantity_change" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."adjust_raw_material_stock"("p_material_id" "uuid", "p_weight_change" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_raw_material_stock"("p_material_id" "uuid", "p_weight_change" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_raw_material_stock"("p_material_id" "uuid", "p_weight_change" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_factory_id" "uuid", "p_state" "text", "p_quantity_change" numeric, "p_cap_id" "uuid", "p_unit_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_factory_id" "uuid", "p_state" "text", "p_quantity_change" numeric, "p_cap_id" "uuid", "p_unit_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_factory_id" "uuid", "p_state" "text", "p_quantity_change" numeric, "p_cap_id" "uuid", "p_unit_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_factory_id" "uuid", "p_state" "public"."inventory_state", "p_quantity_change" numeric, "p_cap_id" "uuid", "p_unit_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_factory_id" "uuid", "p_state" "public"."inventory_state", "p_quantity_change" numeric, "p_cap_id" "uuid", "p_unit_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_stock"("p_product_id" "uuid", "p_factory_id" "uuid", "p_state" "public"."inventory_state", "p_quantity_change" numeric, "p_cap_id" "uuid", "p_unit_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_customer_analytics"("p_customer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_customer_analytics"("p_customer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_customer_analytics"("p_customer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_forecast_accuracy"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_forecast_accuracy"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_forecast_accuracy"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_manager"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_manager"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_manager"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_customer_analytics"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_customer_analytics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_customer_analytics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_factories_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_factories_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_factories_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_settings_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_settings_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_settings_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_profiles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_profiles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_profiles_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_product_raw_material_factory"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_product_raw_material_factory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_product_raw_material_factory"() TO "service_role";


















GRANT ALL ON TABLE "public"."customer_analytics" TO "anon";
GRANT ALL ON TABLE "public"."customer_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."at_risk_customers" TO "anon";
GRANT ALL ON TABLE "public"."at_risk_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."at_risk_customers" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."cap_production_logs" TO "anon";
GRANT ALL ON TABLE "public"."cap_production_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."cap_production_logs" TO "service_role";



GRANT ALL ON TABLE "public"."cap_stock_balances" TO "anon";
GRANT ALL ON TABLE "public"."cap_stock_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."cap_stock_balances" TO "service_role";



GRANT ALL ON TABLE "public"."cap_templates" TO "anon";
GRANT ALL ON TABLE "public"."cap_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."cap_templates" TO "service_role";



GRANT ALL ON TABLE "public"."caps" TO "anon";
GRANT ALL ON TABLE "public"."caps" TO "authenticated";
GRANT ALL ON TABLE "public"."caps" TO "service_role";



GRANT ALL ON TABLE "public"."cash_flow_categories" TO "anon";
GRANT ALL ON TABLE "public"."cash_flow_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_flow_categories" TO "service_role";



GRANT ALL ON TABLE "public"."cash_flow_logs" TO "anon";
GRANT ALL ON TABLE "public"."cash_flow_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_flow_logs" TO "service_role";



GRANT ALL ON TABLE "public"."customer_interactions" TO "anon";
GRANT ALL ON TABLE "public"."customer_interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_interactions" TO "service_role";



GRANT ALL ON TABLE "public"."demand_analytics" TO "anon";
GRANT ALL ON TABLE "public"."demand_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."demand_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."demand_forecasts" TO "anon";
GRANT ALL ON TABLE "public"."demand_forecasts" TO "authenticated";
GRANT ALL ON TABLE "public"."demand_forecasts" TO "service_role";



GRANT ALL ON TABLE "public"."factories" TO "anon";
GRANT ALL ON TABLE "public"."factories" TO "authenticated";
GRANT ALL ON TABLE "public"."factories" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_transactions" TO "anon";
GRANT ALL ON TABLE "public"."inventory_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."machine_products" TO "anon";
GRANT ALL ON TABLE "public"."machine_products" TO "authenticated";
GRANT ALL ON TABLE "public"."machine_products" TO "service_role";



GRANT ALL ON TABLE "public"."machines" TO "anon";
GRANT ALL ON TABLE "public"."machines" TO "authenticated";
GRANT ALL ON TABLE "public"."machines" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."packing_rules" TO "anon";
GRANT ALL ON TABLE "public"."packing_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."packing_rules" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."product_templates" TO "anon";
GRANT ALL ON TABLE "public"."product_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."product_templates" TO "service_role";



GRANT ALL("items_per_bundle") ON TABLE "public"."product_templates" TO "anon";
GRANT ALL("items_per_bundle") ON TABLE "public"."product_templates" TO "authenticated";
GRANT ALL("items_per_bundle") ON TABLE "public"."product_templates" TO "service_role";



GRANT ALL("selling_price") ON TABLE "public"."product_templates" TO "anon";
GRANT ALL("selling_price") ON TABLE "public"."product_templates" TO "authenticated";
GRANT ALL("selling_price") ON TABLE "public"."product_templates" TO "service_role";



GRANT ALL("raw_material_id") ON TABLE "public"."product_templates" TO "anon";
GRANT ALL("raw_material_id") ON TABLE "public"."product_templates" TO "authenticated";
GRANT ALL("raw_material_id") ON TABLE "public"."product_templates" TO "service_role";



GRANT ALL ON TABLE "public"."production_logs" TO "anon";
GRANT ALL ON TABLE "public"."production_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."production_logs" TO "service_role";



GRANT ALL ON TABLE "public"."production_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."production_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."production_recommendations" TO "service_role";



GRANT ALL ON TABLE "public"."production_requests" TO "anon";
GRANT ALL ON TABLE "public"."production_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."production_requests" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL("cap_template_id") ON TABLE "public"."products" TO "anon";
GRANT ALL("cap_template_id") ON TABLE "public"."products" TO "authenticated";
GRANT ALL("cap_template_id") ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."raw_materials" TO "anon";
GRANT ALL ON TABLE "public"."raw_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."raw_materials" TO "service_role";



GRANT ALL ON TABLE "public"."sales_order_items" TO "anon";
GRANT ALL ON TABLE "public"."sales_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."sales_orders" TO "anon";
GRANT ALL ON TABLE "public"."sales_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_orders" TO "service_role";



GRANT ALL ON TABLE "public"."seasonal_patterns" TO "anon";
GRANT ALL ON TABLE "public"."seasonal_patterns" TO "authenticated";
GRANT ALL ON TABLE "public"."seasonal_patterns" TO "service_role";



GRANT ALL ON TABLE "public"."stock_balances" TO "anon";
GRANT ALL ON TABLE "public"."stock_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_balances" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_payments" TO "anon";
GRANT ALL ON TABLE "public"."supplier_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_payments" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."user_push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."user_push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."vip_customers" TO "anon";
GRANT ALL ON TABLE "public"."vip_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."vip_customers" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































