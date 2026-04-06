# Production Database Synchronization Report

**Date:** April 7, 2026
**Environment:** Production (`gncbejlrycumifdhucqr`) vs. Development (`lvgxcganpwxeiyncudnq`)

## Overview

This document outlines the database changes applied to the Production environment to achieve 100% structural and functional schema parity with the Development environment. The database updates were applied following over a week of hardening the sales order fulfillment cycle, cap-machine integrations, and atomic system procedures in development.

## 1. Schema Modifications (New Columns)

To support the latest logic for tracking cap machine cycles, wastage, correct inventory states, and granular supplier payment details, 13 new columns were safely introduced across several core tables using continuous `IF NOT EXISTS` assertions.

| Table | Column Name | Data Type | Purpose |
|---|---|---|---|
| `cap_production_logs` | `machine_id` | `UUID` | Associates a production log tightly to a specific machine for cycle time analysis. |
| `cap_production_logs` | `weight_wastage_kg` | `NUMERIC` | Captures explicit material wastage for cap injection cycles. |
| `customers` | `balance_due` | `NUMERIC` | Enables real-time balance outstanding caching per customer. |
| `inner_production_logs` | `weight_wastage_kg` | `NUMERIC` | Captures material wastage for inner container manufacturing. |
| `inner_stock_balances` | `state` | `VARCHAR` | Enables standard states (e.g., `reserved`, `finished`) for inners. |
| `inner_stock_balances` | `unit_type` | `VARCHAR` | Aligns inner stock balances with the master inventory configuration. |
| `inners` | `ideal_cycle_time_seconds` | `NUMERIC` | Configures target SLA times for inner production. |
| `inners` | `ideal_weight_grams` | `NUMERIC` | Supports theoretical vs actual material usage math. |
| `inventory_transactions` | `inner_id` | `UUID` | Allows inner production cycles to correctly record audit logs. |
| `products` | `inner_id` | `UUID` | Creates proper relational links for bundled products containing inners. |
| `supplier_payments` | `created_by` | `UUID` | Audit trail for the admin member executing the payment. |
| `supplier_payments` | `factory_id` | `UUID` | Maps supplier expenditures to specific factory ledgers. |
| `supplier_payments` | `supplier_id` | `UUID` | Decouples general supplier payments from strict specific purchase orders. |

## 2. Hardened Atomic RPC Stored Procedures 

The core fulfillment and production logic runs entirely at the database level for transactional safety. The legacy parameterized functions on Production were safely dropped and cleanly replaced with their updated Development counterparts.

These upgrades support advanced inventory capabilities, such as distinguishing `loose` units, handling exact partial fulfillment dispatches, decoupling the PM reservation step from initial order creation, and preventing race conditions.

### Synced Procedures:
- **`public.create_order_atomic(UUID, JSONB, TEXT, NUMERIC, DEFAULT TEXT)`**
  Creates atomic sales orders and ensures standard items initiate as 'Awaiting Production' instead of immediately auto-reserving stock.
- **`public.prepare_order_items_atomic(UUID, JSONB, UUID)`**
  Allows the PM to explicitly authorize and commit stock reservations over backordered and standard items.
- **`public.process_partial_dispatch(UUID, JSONB, TEXT, NUMERIC, TEXT, DATE, NUMERIC, TEXT, UUID, TEXT)`**
  Validates strict bounds on what the PM has historically `reserved` and ships it, computing live discounts, payments, and adjusting overall balances.
- **`public.submit_production_atomic(UUID, UUID, INT, TIME, TIME, INT, INT, NUMERIC, NUMERIC, INT, TEXT, DATE, UUID, UUID, INT, NUMERIC, BOOLEAN, NUMERIC)`**
  Finalizes raw material withdrawals, captures wastage algorithms natively, logs downtime, and mints `loose` output product records.
- **`public.adjust_cap_stock(UUID, UUID, NUMERIC, TEXT, TEXT)`**
  A utility helper optimized to manage inventory boundary limits and stock-unit variants correctly.
- **`public.decouple_sales_order_reservation(...)`**
  Handles explicit logic to rip out earlier aggressive auto-reservation algorithms without corrupting existing log timelines.

## Summary

The Production Database is now verified and safely modernized. All backend APIs, web applications, and mobile frontends referencing atomic procedure structures or newly integrated data types (like `machine_id` mappings, or decoupling `supplier_id` on payments) can now be deployed without database collisions.
