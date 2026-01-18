# Sales & Customers Table Documentation

## Overview
The Sales module manages the customer relationship and the order fulfillment lifecycle. It interacts directly with the Inventory system to reserve and deduce stock upon delivery.

## Schema

### 1. `customers`
Master list of clients.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY` | Unique Customer ID. |
| `name` | `TEXT` | `NOT NULL` | Customer Name. |
| `phone` | `TEXT` | - | Contact number. |
| `type` | `TEXT` | `CHECK` | Type: `permanent`, `seasonal`, `other`. |
| `notes` | `TEXT` | - | General notes. |

### 2. `sales_orders`
The header record for a transaction.

| Column | Type | Constraints | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY` | - | Order ID. |
| `customer_id` | `UUID` | `FK` | `NOT NULL` | Link to Customer. |
| `order_date` | `DATE` | - | `CURRENT_DATE` | Date of order. |
| `status` | `TEXT` | `CHECK` | `'reserved'` | `reserved` -> `delivered` -> `cancelled`. |
| `total_amount` | `NUMERIC` | - | - | Total financial value (optional/reference). |

### 3. `sales_order_items`
The line items holding specific product quantities for an order.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY` | Unique Line Item ID. |
| `order_id` | `UUID` | `FK` | Link to Parent Order. Beleted on Cascade. |
| `product_id` | `UUID` | `FK` | Product being sold. |
| `quantity_bundles` | `INTEGER` | `NOT NULL` | **Unit**: Always in Bundles/Sacks (Finished Goods). |
| `unit_price` | `NUMERIC` | - | Price per bundle at time of sale. |

## Relationships
- **One-to-Many**: `customers` -> `sales_orders`.
- **One-to-Many**: `sales_orders` -> `sales_order_items`.
- **Many-to-One**: `sales_order_items` -> `products`.

## Business Logic
1.  **Inventory Impact**:
    *   **On Order Creation (`reserved`)**: Stock moves from `finished` -> `reserved` in `stock_balances`.
    *   **On Delivery (`delivered`)**: Stock is removed from `reserved` and state changes to `delivered`.
    *   **On Cancel**: Stock moves back `reserved` -> `finished`.
2.  **Sales Unit**: Sales are strictly conducted in "Bundles" (Sacks), not individual loose items.
