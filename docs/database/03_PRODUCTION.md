# Production Table Documentation

## Overview
The `production_logs` table stores the daily production data entered by the Production Manager. It acts as the "Daily Truth" for the factory, capturing what was actually produced versus what was theoretically possible, allowing for efficiency calculation and cost analysis.

## Schema
**Table Name**: `production_logs`

| Column | Type | Constraints | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` | Unique identifier. |
| `date` | `DATE` | `NOT NULL` | `CURRENT_DATE` | The production date. |
| `machine_id` | `UUID` | `FK` | `NOT NULL` | The machine used for production. |
| `product_id` | `UUID` | `FK` | `NOT NULL` | The product being manufactured. |
| `shift_hours` | `NUMERIC` | `NOT NULL` | `23` | Effective factory runtime. **Hardcoded Rule**: 23 hours (1 hour maintenance). |
| `actual_quantity` | `INTEGER` | `CHECK >= 0` | `NOT NULL` | The physical count of good units produced. |
| `theoretical_quantity` | `INTEGER` | `NOT NULL` | - | Calculated: `(shift_hours * 3600) / cycle_time`. |
| `efficiency_percentage` | `NUMERIC` | `NOT NULL` | - | Calculated: `(actual / theoretical) * 100`. |
| `waste_weight_grams` | `NUMERIC` | - | `0` | Weight of wasted material in grams. |
| `is_cost_recovered` | `BOOLEAN` | - | `FALSE` | **Critical**: True if `(value_of_production >= machine.daily_running_cost)`. |
| `status` | `TEXT` | `CHECK` | `'submitted'` | Flow: `draft` -> `submitted` -> `verified`. |
| `created_by` | `UUID` | `FK` | - | ID of the user (Production Manager) who logged this. |
| `created_at` | `TIMESTAMPTZ` | - | `NOW()` | Timestamp of entry. |

## Relationships
- **Many-to-One** with `machines`: Links to the specific machine.
- **Many-to-One** with `products`: Links to the product produced.
- **Many-to-One** with `auth.users`: Links to the creator of the log.

## Business Logic & Calculations
1.  **Theoretical Quantity**: This is auto-calculated by the server upon submission to prevent manipulation. It represents the valid maximum output if the machine ran perfectly for the shift hours.
2.  **Efficiency**: A key KPI. Low efficiency alerts management to potential machine or personnel issues.
3.  **Cost Recovery**: The system automatically determines if the specific machine "paid for itself" that day based on the value of goods produced vs. its fixed running cost.
4.  **Immutability**: Once `status` reaches `verified`, the record should be effectively immutable to preserve historical accuracy.
