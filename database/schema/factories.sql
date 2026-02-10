-- Factories Master Table
-- Stores information about each factory location
CREATE TABLE factories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE, -- e.g., 'MAIN', 'POLLANSON'
    location TEXT,
    machine_count INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_factories_code ON factories(code);
CREATE INDEX idx_factories_active ON factories(active);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_factories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_factories_updated_at
    BEFORE UPDATE ON factories
    FOR EACH ROW
    EXECUTE FUNCTION update_factories_updated_at();

-- Comments for clarity
COMMENT ON TABLE factories IS 'Master list of factory locations';
COMMENT ON COLUMN factories.code IS 'Unique identifier used in URLs and internal references';
COMMENT ON COLUMN factories.machine_count IS 'Estimated number of machines (informational only)';
