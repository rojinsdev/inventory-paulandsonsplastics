# Production Planning & Demand Analytics

**Version:** 1.0  
**Date:** January 22, 2026  
**Migration:** `012_production_planning_system.sql`

---

## Overview

Intelligent production planning system that automatically detects seasonal demand patterns and provides data-driven production recommendations.

---

## Database Schema

### New Tables

| Table | Purpose |
|-------|---------|
| `demand_analytics` | Aggregated sales data by day/week/month |
| `seasonal_patterns` | Detected patterns (auto or manual) |
| `production_recommendations` | AI-generated production quantities |
| `demand_forecasts` | Forecasted demand with accuracy tracking |

---

## Seasonal Pattern Detection

The system automatically detects seasonal patterns from historical sales data.

### Algorithm

1. **Aggregate** monthly sales (3+ years)
2. **Calculate** statistics (mean, standard deviation)
3. **Identify spikes** where sales > avg + 1.5σ
4. **Group** consecutive spike months
5. **Score confidence** based on recurrence across years
6. **Name patterns** automatically (e.g., "August Spike")

### Pattern Fields

| Field | Description |
|-------|-------------|
| `pattern_name` | Auto-generated name |
| `start_month` / `end_month` | Pattern date range |
| `demand_multiplier` | Multiplier (e.g., 1.8 = 80% increase) |
| `confidence_score` | 0-100 based on data quality |
| `years_detected` | Years when pattern occurred |
| `detection_method` | `auto` or `manual` |

---

## Production Recommendations

Smart recommendations based on multiple factors:

### Calculation Formula

```
recommended = baseline × (1 + trend%) × seasonal_multiplier - current_stock
```

### Factors Considered

| Factor | Source |
|--------|--------|
| **Baseline** | 6-month average sales |
| **Trend** | 12-month growth/decline rate |
| **Seasonality** | Detected pattern multiplier |
| **Stock** | Current inventory level |

### Recommendation Fields

| Field | Description |
|-------|-------------|
| `recommended_quantity` | Suggested production amount |
| `reasoning` | Human-readable explanation |
| `confidence_score` | 0-100 based on data reliability |
| `status` | `pending`, `accepted`, `rejected` |
| `adjusted_quantity` | User-modified amount |

---

## Demand Forecasting

Multiple forecasting methods available:

| Method | Description |
|--------|-------------|
| **SMA** | Simple Moving Average - equal weights |
| **WMA** | Weighted Moving Average - recent data weighted more |
| **Seasonal** | SMA adjusted by seasonal patterns |
| **Hybrid** | Combination of methods |

### Accuracy Tracking

Forecasts are compared with actual sales:
```
accuracy = 100 - (|actual - forecast| / actual × 100)
```

---

## API Endpoints

### Demand Trends

```
GET /api/planning/demand-trends
  ?period=1m|3m|6m|1y|custom
  &start_date=YYYY-MM-DD
  &end_date=YYYY-MM-DD
  &product_id=UUID
```

### Seasonal Patterns

```
GET /api/planning/seasonal-patterns
  ?product_id=UUID
  &confidence_min=50
  &is_active=true

POST /api/planning/detect-patterns
  { "years_back": 3 }
```

### Production Recommendations

```
GET /api/planning/recommendations
  ?target_month=YYYY-MM
  &status=pending
  &product_id=UUID

POST /api/planning/generate-recommendations
  { "target_month": "2026-02" }

POST /api/planning/recommendations/:id/accept
  { "adjusted_quantity": 15000 }

POST /api/planning/recommendations/:id/reject
  { "rejection_reason": "..." }
```

### Demand Forecasts

```
GET /api/planning/forecasts
  ?product_id=UUID
  &forecast_method=SMA
  &start_date=YYYY-MM-DD
```

### Refresh Analytics

```
POST /api/planning/refresh-analytics
  { "target_month": "2026-02", "years_back": 3 }
```

---

## Frontend Screens

### 1. Demand Insights (`/planning/demand-insights`)

- Time period filters (1m, 3m, 6m, 1y, custom)
- Product trends table with growth rates
- Seasonal patterns display
- Summary statistics cards
- CSV export

### 2. Production Recommendations (`/planning/recommendations`)

- Target month selector
- Recommendations table with reasoning
- Accept/reject workflow
- Inline quantity editing
- Status filtering
- CSV export

### 3. Demand Forecasts (`/planning/forecasts`)

- Product selector
- Forecast method filter
- Line chart (forecast vs actual)
- Accuracy metrics
- Method comparison
- Confidence intervals

---

## Files Structure

### Database
- [`database/migrations/012_production_planning_system.sql`](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/database/migrations/012_production_planning_system.sql)

### Backend
- [`server/src/modules/planning/planning.types.ts`](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/server/src/modules/planning/planning.types.ts) - TypeScript interfaces
- [`server/src/modules/planning/planning.service.ts`](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/server/src/modules/planning/planning.service.ts) - Core algorithms
- [`server/src/modules/planning/planning.controller.ts`](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/server/src/modules/planning/planning.controller.ts) - Request handlers
- [`server/src/modules/planning/planning.routes.ts`](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/server/src/modules/planning/planning.routes.ts) - Route definitions

### Frontend
- [`apps/web/app/planning/demand-insights/page.js`](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/apps/web/app/planning/demand-insights/page.js)
- [`apps/web/app/planning/recommendations/page.js`](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/apps/web/app/planning/recommendations/page.js)
- [`apps/web/app/planning/forecasts/page.js`](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/apps/web/app/planning/forecasts/page.js)
- [`apps/web/lib/api/planning.js`](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/apps/web/lib/api/planning.js) - API client

### Navigation
- Updated `Sidebar.jsx` with Planning section and submenu items
