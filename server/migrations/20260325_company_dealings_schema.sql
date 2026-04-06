-- Suppliers and Purchases Schema

-- 1. Suppliers Table
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    gstin TEXT,
    credit_limit NUMERIC DEFAULT 0,
    balance_due NUMERIC DEFAULT 0,
    factory_id UUID REFERENCES public.factories(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Purchases Table
-- This tracks ALL company purchases (Raw materials, expenses, etc.)
CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    supplier_id UUID REFERENCES public.suppliers(id),
    factory_id UUID NOT NULL REFERENCES public.factories(id),
    purchase_date DATE DEFAULT CURRENT_DATE,
    item_type TEXT NOT NULL, -- 'Raw Material', 'Expense', 'Machine Part', etc.
    description TEXT,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    paid_amount NUMERIC NOT NULL DEFAULT 0,
    balance_due NUMERIC NOT NULL DEFAULT 0,
    payment_status TEXT DEFAULT 'pending', -- 'pending', 'partial', 'paid'
    inventory_transaction_id UUID REFERENCES public.inventory_transactions(id),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Update Supplier Payments
-- Since it already exists with 0 rows, I'll update it to point to purchases
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'supplier_payments') THEN
        -- Check if it already has the constraint and column
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_payments' AND column_name = 'purchase_id') THEN
             ALTER TABLE public.supplier_payments DROP CONSTRAINT IF EXISTS supplier_payments_purchase_id_fkey;
             ALTER TABLE public.supplier_payments ALTER COLUMN purchase_id TYPE UUID;
             ALTER TABLE public.supplier_payments ADD CONSTRAINT supplier_payments_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id);
        END IF;
    ELSE
        CREATE TABLE public.supplier_payments (
            id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
            purchase_id UUID REFERENCES public.purchases(id),
            amount NUMERIC NOT NULL,
            payment_date DATE DEFAULT CURRENT_DATE,
            payment_method TEXT DEFAULT 'Cash',
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        );
    END IF;
END $$;

-- 4. RLS Policies
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for authenticated users' AND tablename = 'suppliers') THEN
        CREATE POLICY "Allow all for authenticated users" ON public.suppliers FOR ALL TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for authenticated users' AND tablename = 'purchases') THEN
        CREATE POLICY "Allow all for authenticated users" ON public.purchases FOR ALL TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for authenticated users' AND tablename = 'supplier_payments') THEN
        CREATE POLICY "Allow all for authenticated users" ON public.supplier_payments FOR ALL TO authenticated USING (true);
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON public.purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_purchase ON public.supplier_payments(purchase_id);

-- 5. Cash Flow Category Unique Constraint and Insertion
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_flow_categories_name_type_key') THEN
        ALTER TABLE public.cash_flow_categories ADD CONSTRAINT cash_flow_categories_name_type_key UNIQUE (name, type);
    END IF;
END $$;

INSERT INTO public.cash_flow_categories (id, name, type, is_system, is_shared)
VALUES 
    (extensions.uuid_generate_v4(), 'Supplier Payment', 'expense', true, true)
ON CONFLICT (name, type) DO NOTHING;
