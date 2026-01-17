# Mobile App: Production Feature

## Overview
The Production feature allows the Production Manager to record daily production output. It focuses on speed and accuracy, using simplified inputs and strict validation.

## Screens

### 1. Dashboard (`DashboardScreen`)
**Location:** `lib/features/production/screens/dashboard_screen.dart`
**Route:** `/` (Home)

**UI Components:**
*   **Greeting:** Time-sensitive greeting (e.g., "Good Morning") dynamically generated based on the current hour.
*   **Navigation:** Bottom navigation bar to switch between Home (`/`), Inventory (`/inventory`), and Settings (`/more`).
*   **Entry Point:** "New Production Entry" FAB (Floating Action Button) or card to navigate to the entry form.

### 2. Production Entry Screen (`ProductionEntryScreen`)
**Location:** `lib/features/production/screens/production_entry_screen.dart`
**Route:** `/production/entry`

**UI Components:**
*   **Machine Selector:** Dropdown to select the machine. Filters active machines.
*   **Product Selector:** Dropdown to select the product.
*   **Quantity Input:** Numeric field for production quantity (kg/units).
*   **Shift Selector:** Simple segment controller (Morning/Evening/Night). *Note: Currently strictly metadata, not used for backend logic.*
*   **Submit Button:** Validates and sends data to server.

## Workflows

### 1. Loading Master Data
1.  Screen opens.
2.  App calls `MasterDataRepository` to fetch:
    *   **Machines:** `GET /machines` (Role: `production_manager` allows read).
    *   **Products:** `GET /products` (Role: `production_manager` allows read).
3.  **Error Handling:**
    *   If API fails (e.g., 403 Forbidden, 500 Error), specific error message is shown (fixed from generic "Error loading").
    *   If API returns Array vs Object, repository handles parsing (see `MD05_API_REFERENCE.md`).

### 2. Submitting Production
1.  User selects Machine and Product.
2.  Enters Quantity.
3.  Taps Submit.
4.  App sends `POST /production/submit` with payload:
    ```json
    {
      "machine_id": "...",
      "product_id": "...",
      "quantity": 100,
      "date": "YYYY-MM-DD"
    }
    ```
5.  **Success:** Shows success snackbar, resets form.
6.  **Failure:** Shows error details.

## Data Layer

### Providers
*   `machinesProvider`: Fetches list of machines.
*   `productsProvider`: Fetches list of products.
*   `productionEntryProvider`: Manages the state of the active form submission.

### Repository (`MasterDataRepository`)
*   **Methods:**
    *   `getMachines()`: Fetches machines. *Important: Handles direct List response from server.*
    *   `getProducts()`: Fetches products. *Important: Handles direct List response from server.*

### Models
*   `Machine`: `id`, `name`, `status`.
*   `Product`: `id`, `name`, `size`, `color`.
*   `ProductionEntry`: DTO for submission.

## Key Logic
*   **Date handling:** Defaults to current date.
*   **Response Parsing:** The repository contains logic to handle `[{},{}]` responses directly, fixing a previous type error where code expected `{data: []}`.
