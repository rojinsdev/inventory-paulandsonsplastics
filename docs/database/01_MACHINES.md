# Machines Table Documentation

## Overview
The `machines` table serves as the master list for all production resources in the factory. It defines the equipment available for scheduling and tracks their operational parameters such as daily running costs and capabilities.

## Schema
**Table Name**: `machines`

| Column | Type | Constraints | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` | Unique identifier for the machine. |
| `name` | `TEXT` | `NOT NULL` | - | Human-readable name of the machine (e.g., "Extruder A"). |
| `type` | `TEXT` | `CHECK IN (...)` | `'extruder'` | Type of machine. Allowed values: `extruder`, `cutting`, `printing`, `packing`. |
| `category` | `TEXT` | `CHECK IN (...)` | `'small'` | Size classification. Allowed values: `small`, `large`, `other`. |
| `max_die_weight` | `NUMERIC` | - | `NULL` | Maximum die weight capacity, applicable only for specific machine types. |
| `daily_running_cost` | `NUMERIC` | `NOT NULL` | `7000` | The fixed daily operational cost (approx 7k-8k). Critical for calculating cost recovery. |
| `status` | `TEXT` | `CHECK IN (...)` | `'active'` | Operational status. Allowed values: `active`, `inactive`. |
| `created_at` | `TIMESTAMPTZ` | - | `NOW()` | Timestamp when the record was created. |
| `updated_at` | `TIMESTAMPTZ` | - | `NOW()` | Timestamp when the record was last updated. |

## relationships
- **One-to-Many** with `production_logs`: A machine can have multiple production entries over time.
- **One-to-Many** with `machine_products`: A machine can be mapped to multiple products it is capable of producing.

## Constraints & Business Logic
1.  **Daily Running Cost**: This value is central to the business logic. The system checks if the value of daily production meets or exceeds this cost to determine if the day was profitable (`is_cost_recovered` in `production_logs`).
2.  **Types**: Strict enum-like check constraints ensure data integrity for machine types.
