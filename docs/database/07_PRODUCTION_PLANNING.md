# Production Planning Tables

**Migration:** `012_production_planning_system.sql`  
**Date:** January 22, 2026

---

## Tables

### demand_analytics

Aggregated sales data for analytics.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `product_id` | UUID | FK to products |
| `period_type` | TEXT | `daily`, `weekly`, `monthly` |
| `period_start` | DATE | Period start date |
| `period_end` | DATE | Period end date |
| `total_quantity_sold` | INTEGER | Units sold |
| `total_orders` | INTEGER | Order count |
| `average_order_size` | NUMERIC | Avg per order |
| `growth_rate_percentage` | NUMERIC | Period-over-period growth |
| `is_seasonal_spike` | BOOLEAN | Auto-flagged spike |
| `confidence_score` | NUMERIC | 0-100 |

**Unique Constraint:** `(product_id, period_type, period_start)`

---

### seasonal_patterns

Detected seasonal demand patterns.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `product_id` | UUID | FK to products (NULL = all) |
| `pattern_name` | TEXT | "August Spike", "Festival Season" |
| `start_month` | INTEGER | 1-12 |
| `end_month` | INTEGER | 1-12 |
| `start_day` | INTEGER | 1-31 |
| `end_day` | INTEGER | 1-31 |
| `demand_multiplier` | NUMERIC | e.g., 1.8 = 80% increase |
| `confidence_score` | NUMERIC | 0-100 |
| `detection_method` | TEXT | `auto` or `manual` |
| `years_detected` | INTEGER[] | Years observed |
| `notes` | TEXT | Additional info |
| `is_active` | BOOLEAN | Pattern enabled |

---

### production_recommendations

AI-generated production suggestions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `product_id` | UUID | FK to products |
| `target_month` | DATE | Month for recommendation |
| `recommended_quantity` | INTEGER | Suggested amount |
| `current_stock_level` | INTEGER | Stock at generation time |
| `average_monthly_sales` | INTEGER | Baseline sales |
| `trend_adjustment_percentage` | NUMERIC | Growth adjustment |
| `seasonal_adjustment_percentage` | NUMERIC | Seasonal adjustment |
| `reasoning` | TEXT | Human-readable explanation |
| `confidence_score` | NUMERIC | 0-100 |
| `status` | TEXT | `pending`, `accepted`, `rejected` |
| `accepted_by` | UUID | User who accepted |
| `accepted_at` | TIMESTAMPTZ | Acceptance time |
| `adjusted_quantity` | INTEGER | User modification |
| `rejection_reason` | TEXT | Why rejected |

---

### demand_forecasts

Forecasted demand with accuracy tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `product_id` | UUID | FK to products |
| `forecast_date` | DATE | Target date |
| `forecast_horizon_months` | INTEGER | How far ahead |
| `forecasted_quantity` | INTEGER | Predicted amount |
| `forecast_method` | TEXT | `SMA`, `WMA`, `seasonal`, `hybrid` |
| `actual_quantity` | INTEGER | Actual (filled later) |
| `accuracy_percentage` | NUMERIC | Calculated accuracy |
| `confidence_interval_lower` | INTEGER | Lower bound |
| `confidence_interval_upper` | INTEGER | Upper bound |

---

## Triggers

### trigger_calculate_forecast_accuracy

Automatically calculates accuracy when `actual_quantity` is updated:
```
accuracy = 100 - (|actual - forecast| / actual × 100)
```

### trigger_*_updated_at

Updates `updated_at` timestamp on all tables.

---

## Indexes

All tables have optimized indexes for:
- Product lookups
- Date range queries
- Status filtering
- Seasonal spike detection
