# Inventory Screens Documentation

## 1. Overview
The Inventory section manages the lifecycle of products from production to dispatch. It is divided into a high-level dashboard and specific detail views for each state.

## 2. Stock Overview (Dashboard)
**Route**: `/inventory`
**Purpose**: summary of stock across all states.
**Components**:
- **Summary Cards**: Shows total quantities for Semi-Finished, Packed, Finished, and Reserved stock.
- **Flow Diagram**: Visualizes the flow of goods.
**Data Logic**:
- Fetches full stock list via `inventoryAPI.getStock()`.
- Client-side aggregation sums up quantities for each state to display totals.

## 3. Detailed Views
These pages provide a filtered list of products in a specific state.

| Page | Route | Description |
| :--- | :--- | :--- |
| **Semi-Finished** | `/inventory/semi-finished` | Loose items fresh from production. |
| **Packed** | `/inventory/packed` | Items packed into packets (e.g., 100/packet). |
| **Finished Goods** | `/inventory/finished-goods` | Bundled packets ready for sale. |
| **Reserved** | `/inventory/reserved` | Stock locked for specific sales orders. |

### 3.1 Common Architecture
All detail pages use a shared architecture:
- **Template**: `components/inventory/InventoryPageTemplate.jsx` handles data fetching and layout.
- **Table**: `components/inventory/InventoryStateTable.jsx` handles rendering the data rows.
- **Filtering**: The template fetches *all* stock data, and the table component filters it based on the `type` prop (e.g., `semi_finished`).

## 3.2 Data Sources
**API Endpoint**: `GET /api/inventory/stock`
**Service Method**: `InventoryService.getAllStock()`
**Response Structure**: Array of `stock_balances` with joined `products` details.

## 4. Raw Materials
**Route**: `/inventory/raw-materials`
**Purpose**: Tracking input materials (Granules, Masterbatch).
**Features**:
- List of raw materials and current stock weight (kg).
- **Add Material** (Admin Only): Create new material definitions.
- "Adjust Stock" button to manually correct levels (logs a transaction).
**API**: `GET /api/inventory/raw-materials`, `POST /api/inventory/raw-materials` (Create).
