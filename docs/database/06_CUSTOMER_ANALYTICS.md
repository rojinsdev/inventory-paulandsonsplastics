# Customer Analytics Tables

**Migration:** `011_customer_profile_enhancement.sql`  
**Date:** January 22, 2026

---

## Tables

### customer_analytics

Aggregated metrics calculated in real-time for each customer.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `customer_id` | UUID | FK to customers |
| `total_orders` | INTEGER | All orders count |
| `delivered_orders` | INTEGER | Completed orders |
| `cancelled_orders` | INTEGER | Cancelled count |
| `reserved_orders` | INTEGER | Reserved count |
| `total_purchase_value` | NUMERIC | Sum of all orders |
| `delivered_value` | NUMERIC | Sum of delivered orders |
| `average_order_value` | NUMERIC | Avg per delivered order |
| `first_purchase_date` | TIMESTAMPTZ | First order date |
| `last_purchase_date` | TIMESTAMPTZ | Most recent order |
| `average_days_between_orders` | NUMERIC | Order frequency |
| `days_since_last_order` | INTEGER | Inactivity counter |
| `most_purchased_product_id` | UUID | Favorite product |
| `most_purchased_product_name` | TEXT | Product name cache |
| `most_purchased_product_quantity` | INTEGER | Total qty purchased |
| `customer_segment` | TEXT | `vip`, `regular`, `at_risk`, `new`, `inactive` |
| `is_active` | BOOLEAN | Active status |
| `risk_level` | TEXT | `low`, `medium`, `high` |
| `last_calculated_at` | TIMESTAMPTZ | Last refresh time |

**Indexes:**
- `idx_customer_analytics_customer_id`
- `idx_customer_analytics_segment`
- `idx_customer_analytics_total_value`
- `idx_customer_analytics_last_purchase`

---

### customer_interactions

Activity log for all customer touchpoints.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `customer_id` | UUID | FK to customers |
| `interaction_type` | TEXT | Type of interaction |
| `description` | TEXT | Details |
| `metadata` | JSONB | Flexible data (order_id, amount, etc.) |
| `performed_by` | UUID | User who performed action |
| `created_at` | TIMESTAMPTZ | When it happened |

**Interaction Types:**
- `order_placed`
- `order_delivered`
- `order_cancelled`
- `note_added`
- `profile_updated`
- `contact_made`
- `payment_received`
- `credit_limit_changed`

---

## Extended customers Fields

| Column | Type | Description |
|--------|------|-------------|
| `email` | TEXT | Customer email |
| `address` | TEXT | Full address |
| `city` | TEXT | City |
| `state` | TEXT | State |
| `pincode` | TEXT | Postal code |
| `gstin` | TEXT | GST Identification Number |
| `credit_limit` | NUMERIC | Max credit allowed |
| `payment_terms` | TEXT | Payment terms |
| `is_active` | BOOLEAN | Active status |
| `tags` | TEXT[] | Categorization tags |

---

## Functions

### calculate_customer_analytics(customer_id)

Calculates all metrics for a customer. Called automatically by trigger.

---

## Triggers

### trg_sales_orders_update_analytics

Fires on INSERT/UPDATE/DELETE on `sales_orders`. Automatically recalculates customer analytics.

---

## Views

| View | Description |
|------|-------------|
| `vip_customers` | VIP customers sorted by purchase value |
| `at_risk_customers` | At-risk customers needing attention |
