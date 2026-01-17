# Mobile App: Inventory Feature

## Overview
The Inventory feature enables the floor management of stock flow. It supports the one-way transition of goods: **Semi-Finished → Packed → Finished**. It also provides a read-only view of current stock levels.

## Screens

### 1. Inventory Hub (`InventoryHubScreen`)
**Location:** `lib/features/inventory/screens/inventory_hub_screen.dart`
**Route:** `/inventory`

**UI Components:**
*   **Stock Summary (NEW):**
    *   Read-only card displaying simplified aggregated totals.
    *   Columns: **Semi-Finished** | **Packed** | **Bundl (Finished)**.
    *   Fetches data from `/inventory/stock`.
    *   Supports Pull-to-Refresh.
*   **Action Cards:** Large touch targets for "Packing" and "Bundling" operations.

### 2. Packing Screen (`PackingScreen`)
**Location:** `lib/features/inventory/screens/packing_screen.dart`
**Route:** `/inventory/packing`

**Workflow:**
1.  User inputs **Semi-Finished** quantity to pack.
2.  Inputs quantity produced (Packed).
3.  Submits `POST /inventory/pack`.
4.  **Effect:** Decreases Semi-Finished stock, Increases Packed stock.

### 3. Bundling Screen (`BundlingScreen`)
**Location:** `lib/features/inventory/screens/bundling_screen.dart`
**Route:** `/inventory/bundling`

**Workflow:**
1.  User inputs **Packed** quantity to bundle.
2.  Submits `POST /inventory/bundle`.
3.  **Effect:** Decreases Packed stock, Increases Finished stock.

## Data Layer

### Providers
*   `inventoryStockProvider`: (FutureProvider) Fetches the read-only stock summary.
*   `inventoryOperationNotifier`: Manages the state and logic for Packing and Bundling actions.

### Repository (`InventoryRepository`)
*   **Methods:**
    *   `getStock()`: `GET /inventory/stock`. Returns `InventoryStock` object.
    *   `pack(data)`: `POST /inventory/pack`.
    *   `bundle(data)`: `POST /inventory/bundle`.

### Models
*   `InventoryStock`:
    *   Fields: `semiFinished`, `packed`, `bundled`.
    *   Parses the aggregated counts from the server.

## Error Handling
*   **Input Validation:** Numeric fields prevent non-numeric input.
*   **API Errors:**
    *   **400 Bad Request:** Insufficient stock (e.g., trying to pack more than available semi-finished).
    *   **500 Server Error:** Generic issues.
    *   UI displays the exact error message from the server (e.g., "Insufficient semi-finished stock") to aid operations.
