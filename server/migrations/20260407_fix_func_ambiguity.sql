-- Migration: 20260407_fix_func_ambiguity.sql
-- Goal: Resolve 'Could not choose the best candidate function' error by unifying signatures.
-- Environments: Production (gncbejlrycumifdhucqr) & Dev (lvgxcganpwxeiyncudnq)

DO $$ 
BEGIN
    -- 1. Clean up adjust_cap_stock
    -- Drop all versions to ensure a clean slate (Legacy and Ambiguous signatures)
    DROP FUNCTION IF EXISTS public.adjust_cap_stock(uuid, uuid, numeric);
    DROP FUNCTION IF EXISTS public.adjust_cap_stock(uuid, uuid, numeric, text, text);
    DROP FUNCTION IF EXISTS public.adjust_cap_stock(uuid, uuid, numeric, character varying, character varying);

    -- Create unified version (MATCH DEV STATE)
    CREATE FUNCTION public.adjust_cap_stock(
        p_cap_id uuid,
        p_factory_id uuid,
        p_quantity_change numeric,
        p_state text DEFAULT 'finished'::text,
        p_unit_type text DEFAULT 'loose'::text
    ) RETURNS void AS $func$
    BEGIN
        INSERT INTO public.cap_stock_balances (cap_id, factory_id, quantity, state, unit_type, last_updated)
        VALUES (p_cap_id, p_factory_id, p_quantity_change, p_state, p_unit_type, now())
        ON CONFLICT (cap_id, factory_id, state, unit_type)
        DO UPDATE SET 
            quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
            last_updated = now();
    END;
    $func$ LANGUAGE plpgsql SECURITY DEFINER;

    -- 2. Clean up adjust_inner_stock
    -- Drop all versions
    DROP FUNCTION IF EXISTS public.adjust_inner_stock(uuid, uuid, numeric);
    DROP FUNCTION IF EXISTS public.adjust_inner_stock(uuid, uuid, numeric, text, text);
    DROP FUNCTION IF EXISTS public.adjust_inner_stock(uuid, uuid, numeric, character varying, character varying);

    -- Create unified version (MATCH DEV STATE)
    CREATE FUNCTION public.adjust_inner_stock(
        p_inner_id uuid,
        p_factory_id uuid,
        p_quantity_change numeric,
        p_state text DEFAULT 'finished'::text,
        p_unit_type text DEFAULT 'loose'::text
    ) RETURNS void AS $func$
    BEGIN
        INSERT INTO public.inner_stock_balances (inner_id, factory_id, quantity, state, unit_type, last_updated)
        VALUES (p_inner_id, p_factory_id, p_quantity_change, p_state, p_unit_type, now())
        ON CONFLICT (inner_id, factory_id, state, unit_type)
        DO UPDATE SET 
            quantity = inner_stock_balances.quantity + EXCLUDED.quantity,
            last_updated = now();
    END;
    $func$ LANGUAGE plpgsql SECURITY DEFINER;
END $$;
