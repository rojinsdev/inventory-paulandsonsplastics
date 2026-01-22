# Customer Profile Enhancement

**Version:** 1.0  
**Date:** January 22, 2026  
**Migration:** `011_customer_profile_enhancement.sql`

---

## Overview

Comprehensive customer profile management with real-time analytics, segmentation, and interaction tracking.

---

## Database Schema

### New Tables

| Table | Purpose |
|-------|---------|
| `customer_analytics` | Aggregated metrics for each customer |
| `customer_interactions` | Activity log for all customer touchpoints |

### Extended Fields (customers table)

| Field | Type | Description |
|-------|------|-------------|
| `email` | TEXT | Customer email |
| `address` | TEXT | Full address |
| `city` | TEXT | City |
| `state` | TEXT | State |
| `pincode` | TEXT | Postal code |
| `gstin` | TEXT | GST Identification Number |
| `credit_limit` | NUMERIC | Maximum credit allowed |
| `payment_terms` | TEXT | `immediate`, `net_15`, `net_30`, `net_60` |
| `is_active` | BOOLEAN | Customer active status |
| `tags` | TEXT[] | Categorization tags |

---

## Customer Segmentation

Customers are automatically segmented based on their purchase behavior:

| Segment | Criteria |
|---------|----------|
| **VIP** | Top 20% by purchase value |
| **Regular** | Active customers with normal purchase patterns |
| **At-Risk** | No orders in 90+ days |
| **Inactive** | No orders in 180+ days |
| **New** | No completed orders yet |

---

## Analytics Metrics

Real-time calculated metrics per customer:

- **Total Orders** - All orders placed
- **Delivered Orders** - Successfully completed orders
- **Total Purchase Value** - Sum of all order values
- **Average Order Value** - Delivered value / delivered orders
- **First/Last Purchase Date** - Order history timeline
- **Days Since Last Order** - Used for at-risk detection
- **Most Purchased Product** - Customer's favorite product
- **Risk Level** - `low`, `medium`, `high` based on cancellation rate

---

## Interaction Types

All customer touchpoints are logged:

| Type | Description |
|------|-------------|
| `order_placed` | New order created |
| `order_delivered` | Order completed |
| `order_cancelled` | Order cancelled |
| `note_added` | Note added to profile |
| `profile_updated` | Profile information changed |
| `contact_made` | Customer contacted |
| `payment_received` | Payment processed |
| `credit_limit_changed` | Credit limit adjusted |

---

## API Endpoints

### Customer Analytics

```
GET /api/customers/:id/analytics
```
Returns real-time analytics for a specific customer.

### Customer Interactions

```
GET /api/customers/:id/interactions
POST /api/customers/:id/interactions
```
List and create interaction records.

### Segment Filtering

```
GET /api/customers?segment=vip
GET /api/customers?segment=at_risk
```
Filter customers by segment.

---

## Automatic Updates

Analytics are automatically recalculated when:
- Order is placed
- Order status changes
- Order is deleted

Trigger: `trg_sales_orders_update_analytics`

---

## Database Views

| View | Description |
|------|-------------|
| `vip_customers` | VIP customers sorted by purchase value |
| `at_risk_customers` | At-risk customers needing attention |

---

## Files Changed

### Database
- [`database/migrations/011_customer_profile_enhancement.sql`](file:///d:/WORKS/SAAS/PaulAndSonsPlastics/inventory-production-system/database/migrations/011_customer_profile_enhancement.sql)

### Backend
- `server/src/modules/customers/customers.service.ts` - Added analytics methods
- `server/src/modules/customers/customers.controller.ts` - Added new endpoints
- `server/src/modules/customers/customers.routes.ts` - Added routes

### Frontend
- `apps/web/app/customers/[id]/page.js` - Enhanced customer profile page
- `apps/web/lib/api/customers.js` - Added API client methods
