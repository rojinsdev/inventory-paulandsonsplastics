-- Migration: 011_customer_profile_enhancement
-- Description: Add customer analytics, interactions tracking, and segmentation features
-- This migration adds comprehensive customer profile management with real-time analytics

-- ============================================================================
-- PART 1: Extend customers table with additional profile fields
-- ============================================================================

ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS pincode TEXT,
ADD COLUMN IF NOT EXISTS gstin TEXT, -- GST Identification Number
ADD COLUMN IF NOT EXISTS credit_limit NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_terms TEXT CHECK (payment_terms IN ('immediate', 'net_15', 'net_30', 'net_60')) DEFAULT 'immediate',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS tags TEXT[], -- Array of tags for categorization
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add index on email for quick lookups
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customers_tags ON customers USING GIN(tags);

-- Add comment
COMMENT ON COLUMN customers.gstin IS 'GST Identification Number for business customers';
COMMENT ON COLUMN customers.credit_limit IS 'Maximum credit limit allowed for this customer';
COMMENT ON COLUMN customers.payment_terms IS 'Default payment terms for this customer';

-- ============================================================================
-- PART 2: Create customer_analytics table
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE UNIQUE NOT NULL,
    
    -- Purchase Metrics
    total_orders INTEGER DEFAULT 0,
    total_purchase_value NUMERIC DEFAULT 0,
    average_order_value NUMERIC DEFAULT 0,
    
    -- Delivered Orders (completed transactions)
    delivered_orders INTEGER DEFAULT 0,
    delivered_value NUMERIC DEFAULT 0,
    
    -- Cancelled/Reserved tracking
    cancelled_orders INTEGER DEFAULT 0,
    reserved_orders INTEGER DEFAULT 0,
    
    -- Timing Metrics
    first_purchase_date TIMESTAMPTZ,
    last_purchase_date TIMESTAMPTZ,
    average_days_between_orders NUMERIC,
    days_since_last_order INTEGER,
    
    -- Product Preferences
    most_purchased_product_id UUID REFERENCES products(id),
    most_purchased_product_name TEXT,
    most_purchased_product_quantity INTEGER DEFAULT 0,
    
    -- Customer Segmentation
    customer_segment TEXT CHECK (customer_segment IN ('vip', 'regular', 'at_risk', 'new', 'inactive')) DEFAULT 'new',
    
    -- Status Indicators
    is_active BOOLEAN DEFAULT true,
    risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high')) DEFAULT 'low',
    
    -- Metadata
    last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_analytics_customer_id ON customer_analytics(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_analytics_segment ON customer_analytics(customer_segment);
CREATE INDEX IF NOT EXISTS idx_customer_analytics_total_value ON customer_analytics(total_purchase_value DESC);
CREATE INDEX IF NOT EXISTS idx_customer_analytics_last_purchase ON customer_analytics(last_purchase_date DESC);

-- Comments
COMMENT ON TABLE customer_analytics IS 'Stores aggregated analytics data for each customer, calculated in real-time';
COMMENT ON COLUMN customer_analytics.customer_segment IS 'Auto-calculated segment: vip, regular, at_risk, new, inactive';
COMMENT ON COLUMN customer_analytics.days_since_last_order IS 'Number of days since last order, used for at-risk detection';

-- ============================================================================
-- PART 3: Create customer_interactions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
    
    -- Interaction Details
    interaction_type TEXT CHECK (interaction_type IN (
        'order_placed', 
        'order_delivered', 
        'order_cancelled', 
        'note_added', 
        'profile_updated', 
        'contact_made',
        'payment_received',
        'credit_limit_changed'
    )) NOT NULL,
    description TEXT,
    metadata JSONB, -- Flexible field for additional data (e.g., order_id, amount, etc.)
    
    -- User Tracking
    performed_by UUID REFERENCES auth.users(id),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_interactions_customer_id ON customer_interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_type ON customer_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_created_at ON customer_interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_performed_by ON customer_interactions(performed_by);

-- Comments
COMMENT ON TABLE customer_interactions IS 'Tracks all customer interactions and touchpoints for complete activity history';
COMMENT ON COLUMN customer_interactions.metadata IS 'JSON field for flexible data storage (order_id, amount, notes, etc.)';

-- ============================================================================
-- PART 4: Create function to calculate customer analytics
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_customer_analytics(p_customer_id UUID)
RETURNS void AS $$
DECLARE
    v_total_orders INTEGER;
    v_delivered_orders INTEGER;
    v_cancelled_orders INTEGER;
    v_reserved_orders INTEGER;
    v_total_value NUMERIC;
    v_delivered_value NUMERIC;
    v_avg_order_value NUMERIC;
    v_first_date TIMESTAMPTZ;
    v_last_date TIMESTAMPTZ;
    v_days_between NUMERIC;
    v_days_since INTEGER;
    v_most_product_id UUID;
    v_most_product_name TEXT;
    v_most_product_qty INTEGER;
    v_segment TEXT;
    v_risk_level TEXT;
BEGIN
    -- Calculate order counts by status
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'delivered'),
        COUNT(*) FILTER (WHERE status = 'cancelled'),
        COUNT(*) FILTER (WHERE status = 'reserved')
    INTO v_total_orders, v_delivered_orders, v_cancelled_orders, v_reserved_orders
    FROM sales_orders
    WHERE customer_id = p_customer_id;

    -- Calculate purchase values
    SELECT 
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'delivered'), 0)
    INTO v_total_value, v_delivered_value
    FROM sales_orders
    WHERE customer_id = p_customer_id;

    -- Calculate average order value (delivered orders only)
    IF v_delivered_orders > 0 THEN
        v_avg_order_value := v_delivered_value / v_delivered_orders;
    ELSE
        v_avg_order_value := 0;
    END IF;

    -- Get first and last purchase dates
    SELECT 
        MIN(order_date),
        MAX(order_date)
    INTO v_first_date, v_last_date
    FROM sales_orders
    WHERE customer_id = p_customer_id AND status = 'delivered';

    -- Calculate average days between orders
    IF v_delivered_orders > 1 AND v_first_date IS NOT NULL AND v_last_date IS NOT NULL THEN
        v_days_between := EXTRACT(EPOCH FROM (v_last_date - v_first_date)) / 86400 / (v_delivered_orders - 1);
    ELSE
        v_days_between := NULL;
    END IF;

    -- Calculate days since last order
    IF v_last_date IS NOT NULL THEN
        v_days_since := EXTRACT(EPOCH FROM (NOW() - v_last_date)) / 86400;
    ELSE
        v_days_since := NULL;
    END IF;

    -- Find most purchased product
    SELECT 
        soi.product_id,
        p.name,
        SUM(soi.quantity_bundles)
    INTO v_most_product_id, v_most_product_name, v_most_product_qty
    FROM sales_order_items soi
    JOIN sales_orders so ON soi.order_id = so.id
    JOIN products p ON soi.product_id = p.id
    WHERE so.customer_id = p_customer_id AND so.status = 'delivered'
    GROUP BY soi.product_id, p.name
    ORDER BY SUM(soi.quantity_bundles) DESC
    LIMIT 1;

    -- Determine customer segment
    IF v_total_orders = 0 THEN
        v_segment := 'new';
    ELSIF v_days_since IS NOT NULL AND v_days_since > 90 THEN
        v_segment := 'at_risk';
    ELSIF v_days_since IS NOT NULL AND v_days_since > 180 THEN
        v_segment := 'inactive';
    ELSIF v_delivered_value >= (
        SELECT PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY total_purchase_value)
        FROM customer_analytics
    ) THEN
        v_segment := 'vip';
    ELSE
        v_segment := 'regular';
    END IF;

    -- Determine risk level
    IF v_cancelled_orders > v_delivered_orders THEN
        v_risk_level := 'high';
    ELSIF v_cancelled_orders > 0 AND v_cancelled_orders::NUMERIC / v_total_orders > 0.2 THEN
        v_risk_level := 'medium';
    ELSE
        v_risk_level := 'low';
    END IF;

    -- Insert or update analytics
    INSERT INTO customer_analytics (
        customer_id,
        total_orders,
        delivered_orders,
        cancelled_orders,
        reserved_orders,
        total_purchase_value,
        delivered_value,
        average_order_value,
        first_purchase_date,
        last_purchase_date,
        average_days_between_orders,
        days_since_last_order,
        most_purchased_product_id,
        most_purchased_product_name,
        most_purchased_product_quantity,
        customer_segment,
        risk_level,
        last_calculated_at,
        updated_at
    ) VALUES (
        p_customer_id,
        v_total_orders,
        v_delivered_orders,
        v_cancelled_orders,
        v_reserved_orders,
        v_total_value,
        v_delivered_value,
        v_avg_order_value,
        v_first_date,
        v_last_date,
        v_days_between,
        v_days_since,
        v_most_product_id,
        v_most_product_name,
        v_most_product_qty,
        v_segment,
        v_risk_level,
        NOW(),
        NOW()
    )
    ON CONFLICT (customer_id) DO UPDATE SET
        total_orders = EXCLUDED.total_orders,
        delivered_orders = EXCLUDED.delivered_orders,
        cancelled_orders = EXCLUDED.cancelled_orders,
        reserved_orders = EXCLUDED.reserved_orders,
        total_purchase_value = EXCLUDED.total_purchase_value,
        delivered_value = EXCLUDED.delivered_value,
        average_order_value = EXCLUDED.average_order_value,
        first_purchase_date = EXCLUDED.first_purchase_date,
        last_purchase_date = EXCLUDED.last_purchase_date,
        average_days_between_orders = EXCLUDED.average_days_between_orders,
        days_since_last_order = EXCLUDED.days_since_last_order,
        most_purchased_product_id = EXCLUDED.most_purchased_product_id,
        most_purchased_product_name = EXCLUDED.most_purchased_product_name,
        most_purchased_product_quantity = EXCLUDED.most_purchased_product_quantity,
        customer_segment = EXCLUDED.customer_segment,
        risk_level = EXCLUDED.risk_level,
        last_calculated_at = NOW(),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_customer_analytics IS 'Calculates and updates all analytics for a specific customer in real-time';

-- ============================================================================
-- PART 5: Create triggers for automatic analytics updates
-- ============================================================================

-- Trigger function to update analytics when orders change
CREATE OR REPLACE FUNCTION trigger_update_customer_analytics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update analytics for the affected customer
    IF TG_OP = 'DELETE' THEN
        PERFORM calculate_customer_analytics(OLD.customer_id);
    ELSE
        PERFORM calculate_customer_analytics(NEW.customer_id);
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on sales_orders
DROP TRIGGER IF EXISTS trg_sales_orders_update_analytics ON sales_orders;
CREATE TRIGGER trg_sales_orders_update_analytics
AFTER INSERT OR UPDATE OR DELETE ON sales_orders
FOR EACH ROW
EXECUTE FUNCTION trigger_update_customer_analytics();

COMMENT ON TRIGGER trg_sales_orders_update_analytics ON sales_orders IS 'Automatically updates customer analytics when orders are created, updated, or deleted';

-- ============================================================================
-- PART 6: Initialize analytics for existing customers
-- ============================================================================

-- Create analytics records for all existing customers
INSERT INTO customer_analytics (customer_id)
SELECT id FROM customers
ON CONFLICT (customer_id) DO NOTHING;

-- Calculate analytics for all existing customers
DO $$
DECLARE
    customer_record RECORD;
BEGIN
    FOR customer_record IN SELECT id FROM customers LOOP
        PERFORM calculate_customer_analytics(customer_record.id);
    END LOOP;
END $$;

-- ============================================================================
-- PART 7: Add RLS policies for new tables
-- ============================================================================

-- Enable RLS on customer_analytics
ALTER TABLE customer_analytics ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read analytics
CREATE POLICY customer_analytics_select_policy
    ON customer_analytics
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: System can insert/update analytics
CREATE POLICY customer_analytics_modify_policy
    ON customer_analytics
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Enable RLS on customer_interactions
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read interactions
CREATE POLICY customer_interactions_select_policy
    ON customer_interactions
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Users can insert interactions
CREATE POLICY customer_interactions_insert_policy
    ON customer_interactions
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- ============================================================================
-- PART 8: Create helper views
-- ============================================================================

-- View for VIP customers
CREATE OR REPLACE VIEW vip_customers AS
SELECT 
    c.*,
    ca.total_purchase_value,
    ca.total_orders,
    ca.last_purchase_date
FROM customers c
JOIN customer_analytics ca ON c.id = ca.customer_id
WHERE ca.customer_segment = 'vip'
ORDER BY ca.total_purchase_value DESC;

-- View for at-risk customers
CREATE OR REPLACE VIEW at_risk_customers AS
SELECT 
    c.*,
    ca.days_since_last_order,
    ca.total_purchase_value,
    ca.last_purchase_date
FROM customers c
JOIN customer_analytics ca ON c.id = ca.customer_id
WHERE ca.customer_segment = 'at_risk'
ORDER BY ca.days_since_last_order DESC;

COMMENT ON VIEW vip_customers IS 'Quick view of VIP customers sorted by purchase value';
COMMENT ON VIEW at_risk_customers IS 'Quick view of at-risk customers who need attention';
