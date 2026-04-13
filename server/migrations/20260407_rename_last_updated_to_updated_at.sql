-- Migration: Rename last_updated to updated_at for consistency with RPC functions
-- Date: 2026-04-07

-- 1. Rename columns in stock_balances
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_balances' AND column_name = 'last_updated') THEN
        ALTER TABLE stock_balances RENAME COLUMN last_updated TO updated_at;
    END IF;
END $$;

-- 2. Rename columns in cap_stock_balances
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cap_stock_balances' AND column_name = 'last_updated') THEN
        ALTER TABLE cap_stock_balances RENAME COLUMN last_updated TO updated_at;
    END IF;
END $$;

-- 3. Rename columns in inner_stock_balances
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inner_stock_balances' AND column_name = 'last_updated') THEN
        ALTER TABLE inner_stock_balances RENAME COLUMN last_updated TO updated_at;
    END IF;
END $$;

-- 4. Re-create/Update adjust_stock function (Standardized)
CREATE OR REPLACE FUNCTION public.adjust_stock(
    p_product_id uuid,
    p_factory_id uuid,
    p_quantity_change numeric,
    p_state character varying DEFAULT 'loose'::character varying,
    p_cap_id uuid DEFAULT NULL::uuid,
    p_inner_id uuid DEFAULT NULL::uuid,
    p_unit_type character varying DEFAULT 'units'::character varying
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.stock_balances (
        product_id, factory_id, state, quantity, cap_id, inner_id, unit_type, updated_at
    )
    VALUES (
        p_product_id, p_factory_id, p_state, p_quantity_change, p_cap_id, p_inner_id, p_unit_type, now()
    )
    ON CONFLICT (product_id, factory_id, state, unit_type, cap_id, inner_id)
    DO UPDATE SET 
        quantity = stock_balances.quantity + EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at;
END;
$$;

-- 5. Re-create/Update adjust_cap_stock function (Standardized)
CREATE OR REPLACE FUNCTION public.adjust_cap_stock(
    p_cap_id uuid,
    p_factory_id uuid,
    p_quantity_change numeric,
    p_state character varying DEFAULT 'packed'::character varying,
    p_unit_type character varying DEFAULT 'units'::character varying
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.cap_stock_balances (
        cap_id, factory_id, state, quantity, unit_type, updated_at
    )
    VALUES (
        p_cap_id, p_factory_id, p_state, p_quantity_change, p_unit_type, now()
    )
    ON CONFLICT (cap_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = cap_stock_balances.quantity + EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at;
END;
$$;

-- 6. Re-create/Update adjust_inner_stock function (Standardized)
CREATE OR REPLACE FUNCTION public.adjust_inner_stock(
    p_inner_id uuid,
    p_factory_id uuid,
    p_quantity_change numeric,
    p_state character varying DEFAULT 'packed'::character varying,
    p_unit_type character varying DEFAULT 'units'::character varying
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.inner_stock_balances (
        inner_id, factory_id, state, quantity, unit_type, updated_at
    )
    VALUES (
        p_inner_id, p_factory_id, p_state, p_quantity_change, p_unit_type, now()
    )
    ON CONFLICT (inner_id, factory_id, state, unit_type)
    DO UPDATE SET 
        quantity = inner_stock_balances.quantity + EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at;
END;
$$;
