# Customer Analytics API

**Base URL:** `/api/customers`  
**Authentication:** Required (Bearer token)

---

## Endpoints

### Get Customer Analytics

**GET** `/:id/analytics`

Returns real-time analytics for a specific customer.

**Response:**
```json
{
  "customer_id": "uuid",
  "total_orders": 45,
  "delivered_orders": 40,
  "cancelled_orders": 3,
  "total_purchase_value": 250000,
  "delivered_value": 230000,
  "average_order_value": 5750,
  "first_purchase_date": "2024-03-15T10:00:00Z",
  "last_purchase_date": "2026-01-15T14:30:00Z",
  "days_since_last_order": 7,
  "most_purchased_product_name": "Cup 250ml Red",
  "most_purchased_product_quantity": 15000,
  "customer_segment": "vip",
  "risk_level": "low"
}
```

---

### Get Customer Interactions

**GET** `/:id/interactions`

Returns activity history for a customer.

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | query | Max records (default: 50) |
| `type` | query | Filter by interaction type |

**Response:**
```json
{
  "data": [{
    "id": "uuid",
    "interaction_type": "order_placed",
    "description": "New order #ORD-2026-001",
    "metadata": { "order_id": "uuid", "amount": 15000 },
    "performed_by": "uuid",
    "created_at": "2026-01-22T10:30:00Z"
  }]
}
```

---

### Add Customer Interaction

**POST** `/:id/interactions`

Log a new interaction.

```json
{
  "interaction_type": "contact_made",
  "description": "Discussed upcoming order requirements",
  "metadata": { "method": "phone" }
}
```

---

### Filter by Segment

**GET** `/`

| Parameter | Type | Description |
|-----------|------|-------------|
| `segment` | query | `vip`, `regular`, `at_risk`, `new`, `inactive` |

Returns customers matching the specified segment.
