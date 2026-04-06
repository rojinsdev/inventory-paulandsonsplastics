# Implementation Plan - Production System Hardening Sync (Final)

This document contains the sequence of steps to synchronize the Production environment (`gncbejlrycumifdhucqr`) with the Hardening standards established in Development.

## Database Information
- **Production Project ID**: `gncbejlrycumifdhucqr`
- **Region**: `ap-south-1`

## Key Operations

### 1. Schema Stabilization
I will ensure the Production database structure matches the updated standard for all 23 migrations:
- Add `balance_due` column to `customers` table for credit tracking.
- Create the missing `cap_machine_mapping` table for machine-cap association.
- Add `supplier_id` column to the `payments` table.

### 2. Atomic Logic Hardening (RPCs)
I will deploy/update the following PostgreSQL functions to ensure transactional safety:
- `transfer_stock_atomic`: Secure inter-factory stock movement with dual-factory audit logs.
- `process_partial_dispatch`: Synchronizes the customer's `balance_due` atomically with sales order updates during shipping.
- `create_order_atomic` (v3.0): Enforces customer credit limits *before* allowing the order to be saved.
- `submit_production_atomic`: Fixes the RM consumption calculation by using measured weights for wastage auditing.

### 3. Financial Synchronization
As part of the migration, I will run a script to calculate the initial `balance_due` for all active customers based on their current "Pending", "Reserved", and "Shipped" but "Unpaid" orders.

## Verification Phase
Once applied, I will perform an internal schema validation using the Supabase MCP server to confirm all columns and functions are effectively present.

## Safety & Rollback
- Each change will be wrapped in a `BEGIN-COMMIT` transaction.
- If any single update fails, the entire database state will pull back to its prior healthy state.
