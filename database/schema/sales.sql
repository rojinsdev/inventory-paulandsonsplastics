-- Customers
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    type TEXT CHECK (type IN ('permanent', 'seasonal', 'other')) NOT NULL DEFAULT 'permanent',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales Orders
CREATE TABLE sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) NOT NULL,
    order_date DATE DEFAULT CURRENT_DATE,
    status TEXT CHECK (status IN ('reserved', 'delivered', 'cancelled')) NOT NULL DEFAULT 'reserved',
    total_amount NUMERIC, -- Optional, for reference
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order Items (What was sold)
CREATE TABLE sales_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) NOT NULL,
    quantity_bundles INTEGER NOT NULL, -- Sales deals in Bundles/Sacks (Finished Goods)
    unit_price NUMERIC, -- Optional
    created_at TIMESTAMPTZ DEFAULT NOW()
);
