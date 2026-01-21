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

### 4. Raw Materials Screen (`RawMaterialsScreen`)
**Location:** `lib/features/inventory/screens/raw_materials_screen.dart`
**Route:** `/inventory/raw-materials`

**UI Components:**
*   List of Raw Materials (Name, Current Stock).
*   **Adjust Button:** Opens modal to Add or Consume stock.

**Workflow:**
1.  User views list.
2.  Taps "Adjust".
3.  Selects "Add Stock" or "Consume".
4.  Submits `POST /inventory/raw-materials/:id/adjust`.

## Data Layer

### Providers
*   `inventoryStockProvider`: (FutureProvider) Fetches the read-only stock summary.
*   `inventoryOperationNotifier`: Manages the state and logic for Packing and Bundling actions.
*   `rawMaterialsProvider`: (FutureProvider) Fetches list of raw materials.

### Repository (`InventoryRepository`)
*   **Methods:**
    *   `getStock()`: `GET /inventory/stock`. Returns `InventoryStock` object.
    *   `pack(data)`: `POST /inventory/pack`.
    *   `bundle(data)`: `POST /inventory/bundle`.
    *   `getRawMaterials()`: `GET /inventory/raw-materials`.
    *   `adjustRawMaterial(id, qty, reason)`: `POST /inventory/raw-materials/:id/adjust`.

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
