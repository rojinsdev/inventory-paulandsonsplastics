# Server Documentation Index

This directory contains detailed documentation for the Node.js/Express Server API used in the Inventory & Production System.

## Table of Contents

| # | Module | File | Description |
| :--- | :--- | :--- | :--- |
| 0 | **Overview** | [00_OVERVIEW.md](./00_OVERVIEW.md) | Architecture, Config, Tech Stack, and Error Handling. |
| 1 | **Machines** | [01_MACHINES_API.md](./01_MACHINES_API.md) | API for managing Factory Equipment. |
| 2 | **Products** | [02_PRODUCTS_API.md](./02_PRODUCTS_API.md) | API for managing Product Catalog and Attributes. |
| 3 | **Production** | [03_PRODUCTION_API.md](./03_PRODUCTION_API.md) | API for Daily Production Logs and Efficiency Logic. |
| 4 | **Inventory** | [04_INVENTORY_API.md](./04_INVENTORY_API.md) | API for Stock Management and State Transitions. |
| 5 | **Sales** | [05_SALES_API.md](./05_SALES_API.md) | API for Sales Orders and Customer Management. |
| 6 | **Auth & Settings** | [06_AUTH_SETTINGS_API.md](./06_AUTH_SETTINGS_API.md) | Authentication endpoints and System Settings. |

## Quick Start

### Prerequisites
-   Node.js (v18+)
-   Supabase Project

### Installation
```bash
cd server
npm install
```

### Running Locally
```bash
npm run dev
```
The server will start on port `4000` (by default).

### API Testing
All endpoints can be tested using Postman or cURL.
**Authentication Header**:
```
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```
