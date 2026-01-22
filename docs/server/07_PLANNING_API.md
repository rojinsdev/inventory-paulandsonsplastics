# Planning API

**Base URL:** `/api/planning`  
**Authentication:** Required (Bearer token)

---

## Endpoints

### Demand Trends

**GET** `/demand-trends`

Get product demand trends over time.

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | query | `1m`, `3m`, `6m`, `1y`, `custom` |
| `start_date` | query | Start date (YYYY-MM-DD) |
| `end_date` | query | End date (YYYY-MM-DD) |
| `product_id` | query | Filter by product |

**Response:**
```json
{
  "data": [{
    "product_id": "uuid",
    "product_name": "Cup 250ml Red",
    "monthly_data": [{ "month": "2026-01", "quantity": 15000, "orders": 45 }],
    "total_quantity": 90000,
    "growth_rate": 15.5,
    "trend": "growing"
  }],
  "period": { "start": "2025-07-01", "end": "2026-01-22" }
}
```

---

### Seasonal Patterns

**GET** `/seasonal-patterns`

| Parameter | Type | Description |
|-----------|------|-------------|
| `product_id` | query | Filter by product |
| `confidence_min` | query | Minimum confidence (0-100) |
| `is_active` | query | `true`/`false` |

**POST** `/detect-patterns`

Trigger pattern detection algorithm.

```json
{ "years_back": 3 }
```

---

### Production Recommendations

**GET** `/recommendations`

| Parameter | Type | Description |
|-----------|------|-------------|
| `target_month` | query | `YYYY-MM` |
| `status` | query | `pending`, `accepted`, `rejected` |
| `product_id` | query | Filter by product |
| `confidence_min` | query | Minimum confidence |

**POST** `/generate-recommendations`

Generate recommendations for a month.

```json
{ "target_month": "2026-02" }
```

**POST** `/recommendations/:id/accept`

```json
{ "adjusted_quantity": 15000 }
```

**POST** `/recommendations/:id/reject`

```json
{ "rejection_reason": "Insufficient capacity" }
```

---

### Demand Forecasts

**GET** `/forecasts`

| Parameter | Type | Description |
|-----------|------|-------------|
| `product_id` | query | Filter by product |
| `forecast_method` | query | `SMA`, `WMA`, `seasonal`, `hybrid` |
| `start_date` | query | Start date |
| `end_date` | query | End date |

---

### Refresh Analytics

**POST** `/refresh-analytics`

Refresh all analytics data.

```json
{
  "target_month": "2026-02",
  "years_back": 3
}
```
