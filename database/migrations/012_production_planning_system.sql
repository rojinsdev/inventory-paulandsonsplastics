-- Migration: Production Planning & Demand Analytics System
-- Description: Adds intelligent production planning with seasonal pattern detection and demand forecasting
-- Date: 2026-01-22

-- ============================================
-- 1. DEMAND ANALYTICS TABLE
-- ============================================
-- Stores aggregated demand data for quick analysis

CREATE TABLE IF NOT EXISTS demand_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) NOT NULL,
    period_type TEXT CHECK (period_type IN ('daily', 'weekly', 'monthly')) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_quantity_sold INTEGER NOT NULL DEFAULT 0,
    total_orders INTEGER NOT NULL DEFAULT 0,
    average_order_size NUMERIC,
    growth_rate_percentage NUMERIC,
    is_seasonal_spike BOOLEAN DEFAULT FALSE,
    confidence_score NUMERIC CHECK (confidence_score BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, period_type, period_start)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_demand_analytics_product_period 
    ON demand_analytics(product_id, period_start);
CREATE INDEX IF NOT EXISTS idx_demand_analytics_seasonal 
    ON demand_analytics(is_seasonal_spike) WHERE is_seasonal_spike = TRUE;
CREATE INDEX IF NOT EXISTS idx_demand_analytics_period_type 
    ON demand_analytics(period_type, period_start);

-- Comments
COMMENT ON TABLE demand_analytics IS 'Aggregated sales demand data for analytics and pattern detection';
COMMENT ON COLUMN demand_analytics.period_type IS 'Aggregation level: daily, weekly, or monthly';
COMMENT ON COLUMN demand_analytics.is_seasonal_spike IS 'Auto-flagged if demand exceeds avg + 1.5 * std_dev';
COMMENT ON COLUMN demand_analytics.confidence_score IS 'Statistical confidence in the data (0-100)';

-- ============================================
-- 2. SEASONAL PATTERNS TABLE
-- ============================================
-- Stores detected seasonal patterns (auto-detected or manual)

CREATE TABLE IF NOT EXISTS seasonal_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id),
    pattern_name TEXT,
    start_month INTEGER CHECK (start_month BETWEEN 1 AND 12),
    end_month INTEGER CHECK (end_month BETWEEN 1 AND 12),
    start_day INTEGER CHECK (start_day BETWEEN 1 AND 31),
    end_day INTEGER CHECK (end_day BETWEEN 1 AND 31),
    demand_multiplier NUMERIC NOT NULL CHECK (demand_multiplier > 0),
    confidence_score NUMERIC CHECK (confidence_score BETWEEN 0 AND 100),
    detection_method TEXT CHECK (detection_method IN ('auto', 'manual')) DEFAULT 'auto',
    years_detected INTEGER[],
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seasonal_patterns_product 
    ON seasonal_patterns(product_id);
CREATE INDEX IF NOT EXISTS idx_seasonal_patterns_months 
    ON seasonal_patterns(start_month, end_month);
CREATE INDEX IF NOT EXISTS idx_seasonal_patterns_active 
    ON seasonal_patterns(is_active) WHERE is_active = TRUE;

-- Comments
COMMENT ON TABLE seasonal_patterns IS 'Detected seasonal demand patterns (festivals, celebrations, etc.)';
COMMENT ON COLUMN seasonal_patterns.pattern_name IS 'Auto-generated or manual name (e.g., "August Spike", "Festival Season")';
COMMENT ON COLUMN seasonal_patterns.demand_multiplier IS 'Multiplier for demand (e.g., 1.8 = 80% increase)';
COMMENT ON COLUMN seasonal_patterns.detection_method IS 'How pattern was detected: auto (algorithm) or manual (user-defined)';
COMMENT ON COLUMN seasonal_patterns.years_detected IS 'Array of years when this pattern was observed';

-- ============================================
-- 3. PRODUCTION RECOMMENDATIONS TABLE
-- ============================================
-- Stores AI-generated production recommendations

CREATE TABLE IF NOT EXISTS production_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) NOT NULL,
    target_month DATE NOT NULL,
    recommended_quantity INTEGER NOT NULL CHECK (recommended_quantity >= 0),
    current_stock_level INTEGER,
    average_monthly_sales INTEGER,
    trend_adjustment_percentage NUMERIC,
    seasonal_adjustment_percentage NUMERIC,
    reasoning TEXT NOT NULL,
    confidence_score NUMERIC CHECK (confidence_score BETWEEN 0 AND 100),
    status TEXT CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
    accepted_by UUID REFERENCES auth.users(id),
    accepted_at TIMESTAMPTZ,
    adjusted_quantity INTEGER,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_production_recommendations_target 
    ON production_recommendations(target_month, status);
CREATE INDEX IF NOT EXISTS idx_production_recommendations_product 
    ON production_recommendations(product_id);
CREATE INDEX IF NOT EXISTS idx_production_recommendations_status 
    ON production_recommendations(status);

-- Comments
COMMENT ON TABLE production_recommendations IS 'AI-generated production quantity recommendations';
COMMENT ON COLUMN production_recommendations.target_month IS 'First day of the month for which recommendation is made';
COMMENT ON COLUMN production_recommendations.reasoning IS 'Human-readable explanation of the recommendation';
COMMENT ON COLUMN production_recommendations.status IS 'pending (awaiting review), accepted, or rejected';
COMMENT ON COLUMN production_recommendations.adjusted_quantity IS 'User-adjusted quantity if they modify the recommendation';

-- ============================================
-- 4. DEMAND FORECASTS TABLE
-- ============================================
-- Stores forecasted demand with accuracy tracking

CREATE TABLE IF NOT EXISTS demand_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) NOT NULL,
    forecast_date DATE NOT NULL,
    forecast_horizon_months INTEGER NOT NULL CHECK (forecast_horizon_months > 0),
    forecasted_quantity INTEGER NOT NULL CHECK (forecasted_quantity >= 0),
    forecast_method TEXT CHECK (forecast_method IN ('SMA', 'WMA', 'seasonal', 'hybrid')) NOT NULL,
    actual_quantity INTEGER,
    accuracy_percentage NUMERIC,
    confidence_interval_lower INTEGER,
    confidence_interval_upper INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_demand_forecasts_product_date 
    ON demand_forecasts(product_id, forecast_date);
CREATE INDEX IF NOT EXISTS idx_demand_forecasts_method 
    ON demand_forecasts(forecast_method);
CREATE INDEX IF NOT EXISTS idx_demand_forecasts_date 
    ON demand_forecasts(forecast_date);

-- Comments
COMMENT ON TABLE demand_forecasts IS 'Demand forecasts with accuracy tracking';
COMMENT ON COLUMN demand_forecasts.forecast_method IS 'SMA (Simple Moving Average), WMA (Weighted), seasonal, or hybrid';
COMMENT ON COLUMN demand_forecasts.actual_quantity IS 'Filled after forecast_date passes for accuracy calculation';
COMMENT ON COLUMN demand_forecasts.accuracy_percentage IS 'Calculated as: 100 - (|actual - forecast| / actual * 100)';

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Function to calculate accuracy when actual data becomes available
CREATE OR REPLACE FUNCTION calculate_forecast_accuracy()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.actual_quantity IS NOT NULL AND OLD.actual_quantity IS NULL THEN
        NEW.accuracy_percentage := 100 - (ABS(NEW.actual_quantity - NEW.forecasted_quantity)::NUMERIC / 
            NULLIF(NEW.actual_quantity, 0) * 100);
        NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate accuracy
DROP TRIGGER IF EXISTS trigger_calculate_forecast_accuracy ON demand_forecasts;
CREATE TRIGGER trigger_calculate_forecast_accuracy
    BEFORE UPDATE ON demand_forecasts
    FOR EACH ROW
    EXECUTE FUNCTION calculate_forecast_accuracy();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trigger_demand_analytics_updated_at ON demand_analytics;
CREATE TRIGGER trigger_demand_analytics_updated_at
    BEFORE UPDATE ON demand_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_seasonal_patterns_updated_at ON seasonal_patterns;
CREATE TRIGGER trigger_seasonal_patterns_updated_at
    BEFORE UPDATE ON seasonal_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_production_recommendations_updated_at ON production_recommendations;
CREATE TRIGGER trigger_production_recommendations_updated_at
    BEFORE UPDATE ON production_recommendations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. INITIAL DATA POPULATION (Optional)
-- ============================================

-- This will be populated by the analytics service when it runs
-- No initial data needed

-- ============================================
-- 7. MIGRATION COMPLETE
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 012_production_planning_system completed successfully';
    RAISE NOTICE 'Created tables: demand_analytics, seasonal_patterns, production_recommendations, demand_forecasts';
    RAISE NOTICE 'Created indexes for performance optimization';
    RAISE NOTICE 'Created triggers for automatic accuracy calculation and timestamp updates';
    RAISE NOTICE 'Ready for analytics service integration';
END $$;
