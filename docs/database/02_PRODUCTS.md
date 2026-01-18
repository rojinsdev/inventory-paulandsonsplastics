# Products Table Documentation

## Overview
The `products` table maintains the catalog of items that the factory produces. It holds static data about the physical properties of the product, such as weight, which is critical for raw material deduction, and packaging standards.

## Schema
**Table Name**: `products`

| Column | Type | Constraints | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` | Unique identifier for the product. |
| `name` | `TEXT` | `NOT NULL` | - | Name of the product (e.g., "1L Water Bottle"). |
| `sku` | `TEXT` | `UNIQUE` | `NULL` | Stock Keeping Unit code for inventory tracking. |
| `size` | `TEXT` | `NOT NULL` | - | Descriptive size (e.g., "100ml", "1L"). |
| `color` | `TEXT` | `NOT NULL` | - | Product color (e.g., "White", "Milky"). |
| `weight_grams` | `NUMERIC(10,2)` | `NOT NULL` | - | Weight of a single unit in grams. **Critical**: Used to calculate raw material usage. |
| `selling_price` | `NUMERIC(10,2)` | - | `NULL` | Standard selling price per unit (optional reference). |
| `items_per_packet` | `INTEGER` | - | `100` | Standard number of loose items packed into a single packet. |
| `packets_per_bundle` | `INTEGER` | - | `50` | Standard number of packets packed into a master bundle/sack. |
| `status` | `TEXT` | `CHECK IN (...)` | `'active'` | Availability status (`active` or `inactive`). |
| `created_at` | `TIMESTAMPTZ` | - | `NOW()` | Creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | - | `NOW()` | Last update timestamp. |

## Related Table: `machine_products`
Defines the "Die" or capability mapping—which machine can make which product.

**Table Name**: `machine_products`

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY` | Unique ID. |
| `machine_id` | `UUID` | `FK` | Links to `machines`. |
| `product_id` | `UUID` | `FK` | Links to `products`. |
| `cycle_time_seconds` | `NUMERIC` | `NOT NULL` | The time it takes to produce one unit/shot. Used to calculate `theoretical_quantity`. |
| `capacity_restriction`| `NUMERIC` | - | Optional operational limit. |

## Relationships
- **One-to-Many** with `production_logs`: Products are referenced in daily production logs.
- **Many-to-Many** with `machines` (via `machine_products`): A product can potentially be made on multiple compatible machines.
- **One-to-Many** with `stock_balances`: Tracks inventory levels for this product.

## Constraints & Business Logic
1.  **Raw Material Deduction**: `weight_grams` * `production_quantity` = Total Raw Material Consumed.
2.  **Theoretical Output**: (23 hours * 3600) / `cycle_time_seconds` = Max possible daily output.
