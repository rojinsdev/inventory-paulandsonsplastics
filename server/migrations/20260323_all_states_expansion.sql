-- Expansion Seed: All inventory states + Inner Seals (Correct Name version)
DO $$
DECLARE
    v_f_id UUID;
    v_it_id UUID;
    v_inner_id UUID;
    v_p_id UUID;
    v_cap_id UUID;
BEGIN
    -- 1. Get the Main Factory
    SELECT id INTO v_f_id FROM public.factories WHERE code = 'MPP-01' LIMIT 1;
    
    -- 2. Handle Inner Seals Template
    SELECT id INTO v_it_id FROM public.inner_templates WHERE name = 'Universal Foil Seal' LIMIT 1;
    IF v_it_id IS NULL THEN
        INSERT INTO public.inner_templates (name, factory_id)
        VALUES ('Universal Foil Seal', v_f_id)
        RETURNING id INTO v_it_id;
    END IF;

    -- 3. Handle Inner Seals Variant
    SELECT id INTO v_inner_id FROM public.inners WHERE template_id = v_it_id AND color = 'Silver' LIMIT 1;
    IF v_inner_id IS NULL THEN
        INSERT INTO public.inners (template_id, color, factory_id)
        VALUES (v_it_id, 'Silver', v_f_id)
        RETURNING id INTO v_inner_id;
    END IF;

    -- 4. Add/Update Stock for Inners
    IF EXISTS (SELECT 1 FROM public.inner_stock_balances WHERE inner_id = v_inner_id AND factory_id = v_f_id) THEN
        UPDATE public.inner_stock_balances 
        SET quantity = 5000 
        WHERE inner_id = v_inner_id AND factory_id = v_f_id;
    ELSE
        INSERT INTO public.inner_stock_balances (inner_id, factory_id, quantity)
        VALUES (v_inner_id, v_f_id, 5000);
    END IF;

    -- 5. Update Existing Products with All Stock states
    SELECT id INTO v_cap_id FROM public.caps WHERE factory_id = v_f_id LIMIT 1;

    FOR v_p_id IN (SELECT id FROM public.products WHERE name LIKE 'H2O 500ml%' AND factory_id = v_f_id)
    LOOP
        -- Semi-finished (Loose)
        IF EXISTS (SELECT 1 FROM public.stock_balances WHERE product_id = v_p_id AND state = 'semi_finished' AND factory_id = v_f_id) THEN
            UPDATE public.stock_balances SET quantity = 1500 
            WHERE product_id = v_p_id AND state = 'semi_finished' AND factory_id = v_f_id;
        ELSE
            INSERT INTO public.stock_balances (product_id, factory_id, state, quantity, unit_type)
            VALUES (v_p_id, v_f_id, 'semi_finished', 1500, '');
        END IF;

        -- Packed
        IF EXISTS (SELECT 1 FROM public.stock_balances WHERE product_id = v_p_id AND state = 'packed' AND factory_id = v_f_id AND (cap_id = v_cap_id OR cap_id IS NULL)) THEN
            UPDATE public.stock_balances SET quantity = 50 
            WHERE product_id = v_p_id AND state = 'packed' AND factory_id = v_f_id;
        ELSE
            INSERT INTO public.stock_balances (product_id, factory_id, state, quantity, unit_type, cap_id, inner_id)
            VALUES (v_p_id, v_f_id, 'packed', 50, 'packet', v_cap_id, v_inner_id);
        END IF;

        -- Reserved
        IF EXISTS (SELECT 1 FROM public.stock_balances WHERE product_id = v_p_id AND state = 'reserved' AND factory_id = v_f_id) THEN
            UPDATE public.stock_balances SET quantity = 100 
            WHERE product_id = v_p_id AND state = 'reserved' AND factory_id = v_f_id;
        ELSE
            INSERT INTO public.stock_balances (product_id, factory_id, state, quantity, unit_type, cap_id, inner_id)
            VALUES (v_p_id, v_f_id, 'reserved', 100, 'bundle', v_cap_id, v_inner_id);
        END IF;
    END LOOP;
END $$;
