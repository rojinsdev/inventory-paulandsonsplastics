-- 2026-03-23: Full Development Database Seed Script
-- Includes: Machines, Raw Materials, Product Templates, Products, Caps, Inners, Stock, and Customers.

DO $$
DECLARE
    v_factory_id UUID;
    v_admin_user_id UUID;
    v_rm1 UUID; v_rm2 UUID; v_rm3 UUID; v_rm4 UUID; v_rm5 UUID;
    v_pt1 UUID; v_pt2 UUID; v_pt3 UUID; v_pt4 UUID; v_pt5 UUID;
    v_cap_t1 UUID; v_cap_t2 UUID; v_cap_t3 UUID;
    v_inner_t1 UUID; v_inner_t2 UUID;
    v_p_id UUID;
    v_c_id UUID;
    v_i_id UUID;
BEGIN
    -- 1. GET FACTORY
    SELECT id INTO v_factory_id FROM public.factories LIMIT 1;
    IF v_factory_id IS NULL THEN
        INSERT INTO public.factories (name, location) VALUES ('Main Plastics Plant', 'Industrial Zone A') RETURNING id INTO v_factory_id;
    END IF;

    -- 2. GET ADMIN USER
    SELECT id INTO v_admin_user_id FROM auth.users WHERE email = 'rojins.dev@gmail.com' LIMIT 1;
    IF v_admin_user_id IS NULL THEN
        -- Fallback to first user in profiles if not found in auth.users (likely due to dev env structure)
        SELECT id INTO v_admin_user_id FROM public.user_profiles LIMIT 1;
    END IF;

    -- 3. RAW MATERIALS (5)
    INSERT INTO public.raw_materials (name, code, description, quantity_kg, factory_id)
    VALUES 
        ('HDPE Granules White', 'RM-HD-W', 'High Density Polyethylene - White', 15000.0, v_factory_id),
        ('LDPE Granules Clear', 'RM-LD-C', 'Low Density Polyethylene - Clear', 8000.0, v_factory_id),
        ('PP Granules Natural', 'RM-PP-N', 'Polypropylene - Natural', 5000.0, v_factory_id),
        ('Masterbatch Blue', 'MB-B', 'Concentrate Color Blue', 500.0, v_factory_id),
        ('Masterbatch Red', 'MB-R', 'Concentrate Color Red', 450.0, v_factory_id)
    ON CONFLICT (code) DO UPDATE SET quantity_kg = EXCLUDED.quantity_kg
    RETURNING id INTO v_rm1; -- Just grab first for simple linking below

    SELECT id INTO v_rm1 FROM public.raw_materials WHERE code = 'RM-HD-W';
    SELECT id INTO v_rm2 FROM public.raw_materials WHERE code = 'RM-LD-C';
    SELECT id INTO v_rm3 FROM public.raw_materials WHERE code = 'RM-PP-N';

    -- 4. MACHINES (8)
    INSERT INTO public.machines (name, code, category, factory_id, status)
    VALUES 
        ('Extruder EX-01', 'EX-01', 'extrusion', v_factory_id, 'idle'),
        ('Extruder EX-02', 'EX-02', 'extrusion', v_factory_id, 'running'),
        ('Extruder EX-03', 'EX-03', 'extrusion', v_factory_id, 'idle'),
        ('Automatic Cutting AC-01', 'AC-01', 'cutting', v_factory_id, 'idle'),
        ('Automatic Cutting AC-02', 'AC-02', 'cutting', v_factory_id, 'idle'),
        ('Rotary Printing RP-01', 'RP-01', 'printing', v_factory_id, 'running'),
        ('Rapid Packing PK-01', 'PK-01', 'packing', v_factory_id, 'idle'),
        ('Standard Packing PK-02', 'PK-02', 'packing', v_factory_id, 'maintenance')
    ON CONFLICT (code) DO NOTHING;

    -- 5. COMPONENT TEMPLATES
    INSERT INTO public.cap_templates (name, description, default_factory_id) 
    VALUES ('Bottle Cap 28mm', 'Standard screw cap', v_factory_id) RETURNING id INTO v_cap_t1;
    INSERT INTO public.cap_templates (name, description, default_factory_id) 
    VALUES ('Wide Mouth Cap 50mm', 'Large lid for jars', v_factory_id) RETURNING id INTO v_cap_t2;
    
    INSERT INTO public.inner_templates (name, description, default_factory_id) 
    VALUES ('Induction Seal 28mm', 'Foil seal for bottles', v_factory_id) RETURNING id INTO v_inner_t1;
    INSERT INTO public.inner_templates (name, description, default_factory_id) 
    VALUES ('Gasket 50mm', 'Rubber seal for jars', v_factory_id) RETURNING id INTO v_inner_t2;

    -- 6. PRODUCT TEMPLATES
    INSERT INTO public.product_templates (name, description, category, default_factory_id)
    VALUES 
        ('Water Bottle 500ml', 'Standard PET Water Bottle', 'bottles', v_factory_id),
        ('Water Bottle 1.5L', 'Family Size PET Bottle', 'bottles', v_factory_id),
        ('Industrial Jar 5L', 'Heavy duty storage jar', 'jars', v_factory_id),
        ('Dairy Jug 2L', 'Milk/Juice container', 'jugs', v_factory_id),
        ('Medicine Vial 100ml', 'Pharma grade bottle', 'vials', v_factory_id)
    RETURNING id INTO v_pt1;
    
    SELECT id INTO v_pt1 FROM public.product_templates WHERE name = 'Water Bottle 500ml';
    SELECT id INTO v_pt2 FROM public.product_templates WHERE name = 'Water Bottle 1.5L';
    SELECT id INTO v_pt3 FROM public.product_templates WHERE name = 'Industrial Jar 5L';
    SELECT id INTO v_pt4 FROM public.product_templates WHERE name = 'Dairy Jug 2L';
    SELECT id INTO v_pt5 FROM public.product_templates WHERE name = 'Medicine Vial 100ml';

    -- 7. CAPS & INNERS (Variants)
    INSERT INTO public.caps (name, color, template_id, factory_id) VALUES ('White 28mm Cap', 'White', v_cap_t1, v_factory_id) RETURNING id INTO v_c_id;
    INSERT INTO public.cap_stock_balances (cap_id, state, loose_quantity) VALUES (v_c_id, 'loose', 5000);
    
    INSERT INTO public.inners (name, color, template_id, factory_id) VALUES ('Silver Foil 28mm', 'Silver', v_inner_t1, v_factory_id) RETURNING id INTO v_i_id;
    INSERT INTO public.inner_stock_balances (inner_id, state, loose_quantity) VALUES (v_i_id, 'loose', 5000);

    -- 8. PRODUCTS (20 Variants)
    -- Template 1 (500ml)
    FOR i IN 1..4 LOOP
        INSERT INTO public.products (name, size, color, weight_grams, items_per_packet, packets_per_bundle, sku, selling_price, factory_id, raw_material_id, template_id)
        VALUES ('Water 500ml ' || (CASE WHEN i=1 THEN 'Clear' WHEN i=2 THEN 'Blue' WHEN i=3 THEN 'White' ELSE 'Green' END), '500ml', (CASE WHEN i=1 THEN 'Clear' WHEN i=2 THEN 'Blue' WHEN i=3 THEN 'White' ELSE 'Green' END), 15.0, 50, 20, 'WB500-' || i, 120.0, v_factory_id, v_rm1, v_pt1)
        RETURNING id INTO v_p_id;
        
        -- Seed Stock
        INSERT INTO public.stock_balances (product_id, state, loose_quantity, packets_quantity, bundles_quantity)
        VALUES (v_p_id, 'loose', 500, 10, 5);
        INSERT INTO public.stock_balances (product_id, state, loose_quantity, packets_quantity, bundles_quantity)
        VALUES (v_p_id, 'semi_finished', 1000, 0, 0);
        INSERT INTO public.stock_balances (product_id, state, loose_quantity, packets_quantity, bundles_quantity)
        VALUES (v_p_id, 'finished', 0, 50, 10);
    END LOOP;

    -- Template 2 (1.5L)
    FOR i IN 1..4 LOOP
        INSERT INTO public.products (name, size, color, weight_grams, items_per_packet, packets_per_bundle, sku, selling_price, factory_id, raw_material_id, template_id)
        VALUES ('Water 1.5L ' || (CASE WHEN i=1 THEN 'Clear' WHEN i=2 THEN 'Blue' WHEN i=3 THEN 'White' ELSE 'Green' END), '1.5L', (CASE WHEN i=1 THEN 'Clear' WHEN i=2 THEN 'Blue' WHEN i=3 THEN 'White' ELSE 'Green' END), 35.0, 25, 10, 'WB1500-' || i, 250.0, v_factory_id, v_rm1, v_pt2)
        RETURNING id INTO v_p_id;
        INSERT INTO public.stock_balances (product_id, state, loose_quantity, packets_quantity, bundles_quantity)
        VALUES (v_p_id, 'finished', 0, 20, 5);
    END LOOP;

    -- Template 3 (Industrial Jar 5L)
    FOR i IN 1..4 LOOP
        INSERT INTO public.products (name, size, color, weight_grams, items_per_packet, packets_per_bundle, sku, selling_price, factory_id, raw_material_id, template_id)
        VALUES ('Ind Jar 5L ' || (CASE WHEN i=1 THEN 'White' WHEN i=2 THEN 'Blue' WHEN i=3 THEN 'Yellow' ELSE 'Black' END), '5L', (CASE WHEN i=1 THEN 'White' WHEN i=2 THEN 'Blue' WHEN i=3 THEN 'Yellow' ELSE 'Black' END), 180.0, 5, 2, 'IJ5000-' || i, 850.0, v_factory_id, v_rm1, v_pt3)
        RETURNING id INTO v_p_id;
        INSERT INTO public.stock_balances (product_id, state, loose_quantity, packets_quantity, bundles_quantity)
        VALUES (v_p_id, 'finished', 0, 10, 2);
    END LOOP;

    -- 9. CUSTOMERS (10)
    INSERT INTO public.customers (name, code, type, contact_person, contact_phone, contact_email, address, credit_limit, segment)
    VALUES 
        ('Apex Pharma Ltd', 'C-001', 'permanent', 'John Doe', '017111111', 'apex@example.com', 'Dhaka', 500000.0, 'platinum'),
        ('City Retailers', 'C-002', 'permanent', 'Jane Smith', '017222222', 'city@example.com', 'CTG', 200000.0, 'gold'),
        ('Global Exports Co', 'C-003', 'other', 'Sam Wilson', '017333333', 'global@example.com', 'Dubai', 0.0, 'silver'),
        ('Fast Water Distro', 'C-004', 'permanent', 'Bob Brown', '017444444', 'fast@example.com', 'KHL', 100000.0, 'silver'),
        ('Mega Dairy Inc', 'C-005', 'permanent', 'Alice Key', '017555555', 'mega@example.com', 'SYL', 800000.0, 'platinum'),
        ('Metro Plastics', 'C-006', 'other', 'Charlie Hub', '017666666', 'metro@example.com', 'Dhaka', 50000.0, 'bronze'),
        ('North Bottlers', 'C-007', 'permanent', 'David Link', '017777777', 'north@example.com', 'RAJ', 150000.0, 'gold'),
        ('Ocean Beverages', 'C-008', 'permanent', 'Eve Line', '017888888', 'ocean@example.com', 'Coxs Bazar', 300000.0, 'gold'),
        ('Pure Life Water', 'C-009', 'permanent', 'Frank Tank', '017999999', 'pure@example.com', 'Dhaka', 400000.0, 'platinum'),
        ('Quick Supply Ltd', 'C-010', 'other', 'Grace Lee', '017000000', 'quick@example.com', 'CTG', 0.0, 'silver')
    ON CONFLICT (code) DO NOTHING;

    -- 10. MACHINE PRODUCT MAPPING
    INSERT INTO public.machine_products (machine_id, product_id)
    SELECT m.id, p.id FROM public.machines m, public.products p 
    WHERE m.code LIKE 'EX-%' LIMIT 20
    ON CONFLICT DO NOTHING;

    -- 11. HISTORICAL PRODUCTION LOGS (7 Days)
    FOR d IN 0..6 LOOP
        INSERT INTO public.production_logs (factory_id, machine_id, product_id, raw_material_id, quantity_bags, weight_per_bag_kg, total_weight_kg, loose_quantity, packets_quantity, bundles_quantity, state, created_by, created_at)
        SELECT 
            v_factory_id, 
            m.id, 
            p.id, 
            v_rm1, 
            15, 25.0, 375.0, 500, 10, 1, 
            'finished', 
            v_admin_user_id, 
            NOW() - (d || ' days')::INTERVAL
        FROM public.machines m, public.products p
        WHERE m.code = 'EX-01' AND p.sku = 'WB500-1'
        LIMIT 1;
    END LOOP;

END $$;
