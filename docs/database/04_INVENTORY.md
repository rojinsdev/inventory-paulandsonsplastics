# Inventory Table Documentation

## Overview
The Inventory system is built around a strict state machine and a double-entry style layout where `stock_balances` serves as the current state, and `inventory_transactions` provides the audit trail. It manages the flow of goods from raw materials to finished delivery.

## Schema

### 1. `stock_balances` (The Source of Truth)
Holds the current quantity of a specific product in a specific state.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY` | Unique ID. |
| `product_id` | `UUID` | `FK`, `NOT NULL` | The product. |
| `state` | `ENUM` | `NOT NULL` | Current stage in lifecycle (e.g., `packed`, `finished`). |
| `quantity` | `NUMERIC` | `NOT NULL` | Current on-hand quantity. **Note**: Unit varies by state (Items, Packets, or Bundles). |
| `last_updated` | `TIMESTAMPTZ` | - | Timestamp of last change. |
| **Constraint** | `UNIQUE` | `(product_id, state)` | A product can only have one balance entry per state. |

### 2. `inventory_transactions` (Audit Log)
Records every movement of stock.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Unique ID. |
| `product_id` | `UUID` | The product involved. |
| `from_state` | `inventory_state` | Previous state (NULL if new production). |
| `to_state` | `inventory_state` | New state (NULL if waste/loss). |
| `quantity` | `NUMERIC` | Amount moved. |
| `reference_id` | `UUID` | ID of the triggering event (e.g., `production_log.id` or `sales_order.id`). |
| `note` | `TEXT` | Manual notes or context. |
| `created_by` | `UUID` | User who performed the action. |

### 3. `raw_materials`
Tracks the input material (Granules) before it becomes a product.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Unique ID. |
| `name` | `TEXT` | Material Name (Unique). |
| `stock_weight_kg` | `NUMERIC` | Current total weight in KG. |

## Inventory State Machine (`inventory_state`)
The life-cycle of a product follows this strict path:
1.  **`semi_finished`**: Freshly produced items (loose count).
2.  **`packed`**: Items put into packets (count in Packets).
3.  **`finished`**: Packets put into Bundles/Sacks (count in Bundles). **This is sellable stock**.
4.  **`reserved`**: Bundles set aside for a specific Sales Order.
5.  **`delivered`**: Bundles left the factory.

## Business Logic
- **Unit Conversion**: Moving from `semi_finished` -> `packed` -> `finished` involves division by `items_per_packet` and `packets_per_bundle` respectively.
- **Traceability**: Every change in `stock_balances` must be accompanied by an `inventory_transaction` row.
