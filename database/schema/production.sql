-- Production Logs
-- The "Daily Truth" entered by the Production Manager
CREATE TABLE production_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    machine_id UUID REFERENCES machines(id) NOT NULL,
    product_id UUID REFERENCES products(id) NOT NULL,
    
    -- Inputs
    shift_hours NUMERIC NOT NULL DEFAULT 23, -- Hardcoded rule: 23 hours effective runtime
    actual_quantity INTEGER NOT NULL CHECK (actual_quantity >= 0),
    
    -- Calculated Fields (Stored for historical integrity)
    theoretical_quantity INTEGER NOT NULL, -- Calculated by Server: (shift_hours * 3600) / cycle_time
    efficiency_percentage NUMERIC NOT NULL, -- Calculated by Server: (actual / theoretical) * 100
    waste_weight_grams NUMERIC DEFAULT 0, -- Logging wastage
    
    -- Cost Logic
    is_cost_recovered BOOLEAN DEFAULT FALSE, -- Result of: (Value of Prod >= Daily Running Cost)
    
    status TEXT CHECK (status IN ('draft', 'submitted', 'verified')) DEFAULT 'submitted',
    created_by UUID REFERENCES auth.users(id), -- Link to Supabase Auth User
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE production_logs IS 'Daily production entries. Immutable after verification.';
