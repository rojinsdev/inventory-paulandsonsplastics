# Database Documentation Index

This directory contains detailed documentation for the PostgreSQL database schema used in the Inventory & Production System.

## Table of Contents

| # | Module | File | Description |
| :--- | :--- | :--- | :--- |
| 1 | **Machines** | [01_MACHINES.md](./01_MACHINES.md) | Factory equipment, capabilities, and running costs. |
| 2 | **Products** | [02_PRODUCTS.md](./02_PRODUCTS.md) | Product definitions, weights, and packaging standards. |
| 3 | **Production** | [03_PRODUCTION.md](./03_PRODUCTION.md) | Daily production logs, efficiency calculations, and cost recovery. |
| 4 | **Inventory** | [04_INVENTORY.md](./04_INVENTORY.md) | Stock balances, state machine (Semi -> Packed -> Finished), and transaction history. |
| 5 | **Sales** | [05_SALES.md](./05_SALES.md) | Customers, Orders, and Order Items. |

## Quick Schema Overview

The database is designed with strict constraints to ensure data integrity at the database level.
- **UUIDs** are used for all Primary Keys.
- **Foreign Keys** enforce referential integrity.
- **Check Constraints** are used for Enums (Status, Types) to prevent invalid data entry.
- **Timestamps** (`created_at`, `updated_at`) are automatic for auditing.
