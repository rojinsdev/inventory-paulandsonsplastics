-- Machines Master Table
CREATE TABLE machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('extruder', 'cutting', 'printing', 'packing')) NOT NULL DEFAULT 'extruder',
    category TEXT CHECK (category IN ('small', 'large', 'other')) NOT NULL DEFAULT 'small',
    max_die_weight NUMERIC, -- Only applicable for some machines
    daily_running_cost NUMERIC NOT NULL DEFAULT 7000, -- The critical constraint (7k-8k)
    status TEXT CHECK (status IN ('active', 'inactive')) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments for clarity
COMMENT ON TABLE machines IS 'Master list of 8 production machines';
COMMENT ON COLUMN machines.daily_running_cost IS 'Used for daily cost recovery calculation';
