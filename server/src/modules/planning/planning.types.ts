// TypeScript interfaces and types for Production Planning module

export interface DemandAnalytics {
    id: string;
    product_id: string;
    period_type: 'daily' | 'weekly' | 'monthly';
    period_start: string; // Date string
    period_end: string;
    total_quantity_sold: number;
    total_orders: number;
    average_order_size: number;
    growth_rate_percentage: number | null;
    is_seasonal_spike: boolean;
    confidence_score: number | null;
    created_at: string;
    updated_at: string;
}

export interface SeasonalPattern {
    id: string;
    product_id: string | null;
    pattern_name: string | null;
    start_month: number;
    end_month: number;
    start_day: number | null;
    end_day: number | null;
    demand_multiplier: number;
    confidence_score: number | null;
    detection_method: 'auto' | 'manual';
    years_detected: number[] | null;
    notes: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface ProductionRecommendation {
    id: string;
    product_id: string;
    target_month: string; // Date string (YYYY-MM-01)
    recommended_quantity: number;
    current_stock_level: number | null;
    average_monthly_sales: number | null;
    trend_adjustment_percentage: number | null;
    seasonal_adjustment_percentage: number | null;
    reasoning: string;
    confidence_score: number | null;
    status: 'pending' | 'accepted' | 'rejected';
    accepted_by: string | null;
    accepted_at: string | null;
    adjusted_quantity: number | null;
    rejection_reason: string | null;
    created_at: string;
    updated_at: string;
}

export interface DemandForecast {
    id: string;
    product_id: string;
    forecast_date: string;
    forecast_horizon_months: number;
    forecasted_quantity: number;
    forecast_method: 'SMA' | 'WMA' | 'seasonal' | 'hybrid';
    actual_quantity: number | null;
    accuracy_percentage: number | null;
    confidence_interval_lower: number | null;
    confidence_interval_upper: number | null;
    created_at: string;
    updated_at: string;
}

// Request/Response types

export interface DemandTrendsFilters {
    period?: '1m' | '3m' | '6m' | '1y' | 'custom';
    start_date?: string;
    end_date?: string;
    product_id?: string;
}

export interface DemandTrendsResponse {
    period: string;
    start_date: string;
    end_date: string;
    products: ProductDemandTrend[];
}

export interface ProductDemandTrend {
    product_id: string;
    product_name: string;
    product_size: string;
    product_color: string;
    total_sold: number;
    growth_rate: number | null;
    trend: 'growing' | 'stable' | 'declining';
    monthly_breakdown: MonthlyBreakdown[];
    seasonal_patterns: SeasonalPattern[];
}

export interface MonthlyBreakdown {
    month: string; // YYYY-MM
    quantity: number;
    orders: number;
    is_spike: boolean;
}

export interface SeasonalPatternsFilters {
    product_id?: string;
    confidence_min?: number;
    is_active?: boolean;
}

export interface SeasonalPatternsResponse {
    patterns: SeasonalPatternWithProduct[];
}

export interface SeasonalPatternWithProduct extends SeasonalPattern {
    product_name?: string;
    product_size?: string;
    product_color?: string;
}

export interface RecommendationsFilters {
    target_month?: string; // YYYY-MM
    status?: 'pending' | 'accepted' | 'rejected';
    product_id?: string;
    confidence_min?: number;
}

export interface RecommendationsResponse {
    target_month: string;
    recommendations: RecommendationWithProduct[];
}

export interface RecommendationWithProduct extends ProductionRecommendation {
    product_name: string;
    product_size: string;
    product_color: string;
    product_category: string;
}

export interface AcceptRecommendationRequest {
    adjusted_quantity?: number;
}

export interface RejectRecommendationRequest {
    rejection_reason?: string;
}

export interface ForecastsFilters {
    product_id?: string;
    forecast_horizon_months?: number;
    forecast_method?: 'SMA' | 'WMA' | 'seasonal' | 'hybrid';
    start_date?: string;
    end_date?: string;
}

export interface ForecastsResponse {
    forecasts: ForecastWithProduct[];
    accuracy_summary: AccuracySummary;
}

export interface ForecastWithProduct extends DemandForecast {
    product_name: string;
    product_size: string;
    product_color: string;
}

export interface AccuracySummary {
    total_forecasts: number;
    forecasts_with_actuals: number;
    average_accuracy: number | null;
    by_method: {
        method: string;
        count: number;
        average_accuracy: number | null;
    }[];
}

// Internal calculation types

export interface SalesDataPoint {
    date: string;
    quantity: number;
    orders: number;
}

export interface MonthlyAggregate {
    month: string;
    year: number;
    month_number: number;
    quantity: number;
    orders: number;
    average_order_size: number;
}

export interface TrendCalculation {
    growth_rate: number;
    trend: 'growing' | 'stable' | 'declining';
    confidence: number;
}

export interface StockLevel {
    product_id: string;
    semi_finished: number;
    packed: number;
    finished: number;
    total_available: number;
}

export interface RecommendationInput {
    product_id: string;
    target_month: Date;
    historical_months: number;
}

export interface RecommendationCalculation {
    baseline_quantity: number;
    trend_adjustment: number;
    seasonal_multiplier: number;
    stock_adjustment: number;
    final_recommendation: number;
    confidence_score: number;
    reasoning: string;
}
