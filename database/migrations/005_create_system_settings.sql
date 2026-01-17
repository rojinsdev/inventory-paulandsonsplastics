-- Migration: Create system_settings table
-- This table stores all configurable system parameters

CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Categorization
    category VARCHAR(50) NOT NULL,
    key VARCHAR(100) NOT NULL UNIQUE,
    
    -- Polymorphic value storage
    value_text TEXT,
    value_number DECIMAL(10, 2),
    value_boolean BOOLEAN,
    value_json JSONB,
    
    -- Metadata
    data_type VARCHAR(20) NOT NULL CHECK (data_type IN ('text', 'number', 'boolean', 'json')),
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- UI Configuration
    ui_input_type VARCHAR(50),
    ui_options JSONB,
    
    -- Validation
    min_value DECIMAL(10, 2),
    max_value DECIMAL(10, 2),
    is_required BOOLEAN DEFAULT true,
    
    -- System flags
    is_editable BOOLEAN DEFAULT true,
    requires_restart BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES user_profiles(id)
);

-- Indexes for performance
CREATE INDEX idx_settings_category ON system_settings(category);
CREATE INDEX idx_settings_key ON system_settings(key);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_settings_timestamp();

-- Seed default configuration values
INSERT INTO system_settings (category, key, value_number, data_type, display_name, description, min_value, max_value) VALUES
-- Production Settings
('production', 'shift_runtime_hours', 23, 'number', 'Shift Runtime (Hours)', 'Effective production hours per 24-hour shift', 1, 24),
('production', 'maintenance_buffer_hours', 1, 'number', 'Maintenance Buffer (Hours)', 'Time reserved for maintenance and downtime', 0, 24),
('production', 'efficiency_warning_threshold', 70, 'number', 'Efficiency Warning (%)', 'Alert when production efficiency drops below this percentage', 0, 100),
('production', 'cost_recovery_threshold', 100, 'number', 'Cost Recovery Threshold (%)', 'Minimum cost recovery percentage expected', 0, 500);

INSERT INTO system_settings (category, key, value_boolean, data_type, display_name, description) VALUES
('production', 'allow_manual_production_edit', false, 'boolean', 'Allow Edit Production Logs', 'Production Managers can edit submitted production logs');

INSERT INTO system_settings (category, key, value_number, data_type, display_name, description, min_value, max_value) VALUES
-- Inventory Settings
('inventory', 'default_items_per_packet', 12, 'number', 'Default Items Per Packet', 'Fallback value when product does not specify', 1, NULL),
('inventory', 'default_packets_per_bundle', 50, 'number', 'Default Packets Per Bundle', 'Fallback value when product does not specify', 1, NULL),
('inventory', 'low_stock_alert_bundles', 10, 'number', 'Low Stock Alert (Bundles)', 'Alert when finished stock drops below this level', 0, NULL),
('inventory', 'raw_material_wastage_percent', 5, 'number', 'Raw Material Wastage (%)', 'Allowed wastage percentage during production', 0, 50);

INSERT INTO system_settings (category, key, value_boolean, data_type, display_name, description) VALUES
('inventory', 'allow_partial_packing', true, 'boolean', 'Allow Partial Packing', 'Allow packing less than a full packet quantity');

INSERT INTO system_settings (category, key, value_number, data_type, display_name, description, min_value, max_value) VALUES
-- Sales Settings
('sales', 'max_reservation_days', 30, 'number', 'Max Reservation Duration (Days)', 'Auto-expire reserved orders after this many days', 1, 365);

INSERT INTO system_settings (category, key, value_boolean, data_type, display_name, description) VALUES
('sales', 'allow_order_without_customer', false, 'boolean', 'Allow Anonymous Orders', 'Create orders without customer details'),
('sales', 'allow_partial_delivery', false, 'boolean', 'Allow Partial Delivery', 'Deliver part of an order'),
('sales', 'allow_edit_delivered_orders', false, 'boolean', 'Allow Edit Delivered Orders', 'Edit orders after they have been delivered');

INSERT INTO system_settings (category, key, value_number, data_type, display_name, description, min_value, max_value) VALUES
-- Authentication Settings
('auth', 'session_timeout_minutes', 60, 'number', 'Session Timeout (Minutes)', 'Auto-logout after this many minutes of inactivity', 5, 1440),
('auth', 'password_min_length', 8, 'number', 'Minimum Password Length', 'Required minimum characters for passwords', 6, 50);

INSERT INTO system_settings (category, key, value_number, data_type, display_name, description, min_value, max_value) VALUES
-- Dashboard Settings
('dashboard', 'default_report_days', 30, 'number', 'Default Report Range (Days)', 'Default date filter for reports', 1, 365),
('dashboard', 'recent_production_limit', 10, 'number', 'Dashboard Recent Entries', 'Number of recent production logs to show', 1, 50);

-- Enable RLS on system_settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Admin can manage all settings
CREATE POLICY "Admins can manage settings"
    ON system_settings
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() 
              AND role = 'admin' 
              AND active = true
        )
    );

-- Production managers can view settings (read-only)
CREATE POLICY "Production managers can view settings"
    ON system_settings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() 
              AND role = 'production_manager' 
              AND active = true
        )
    );
