# Production API

## Base URL
`/api/production`

## Module Description
Handles the daily "Production Logs". This is the transaction engine where the Production Manager inputs the daily output. This module is responsible for calculating efficiency, theoretical output, and validating business rules (e.g., 23-hour limit).

## Endpoints

### 1. List Production Logs
-   **GET** `/`
-   **Auth**: Required (`admin`, `production_manager`)
-   **Query Params**:
    -   `date`: Filter by specific date.
    -   `machine_id`: Filter by machine.
-   **Description**: Retrieves history of production logs.

### 2. Create Production Log (Submit Daily Truth)
-   **POST** `/`
-   **Auth**: Production Manager
-   **Body**:
    ```json
    {
      "date": "2024-01-01",
      "machine_id": "uuid...",
      "product_id": "uuid...",
      "shift_hours": 23,
      "actual_quantity": 5000,
      "waste_weight_grams": 100 // optional
    }
    ```
-   **Server-Side Logic**:
    -   **Calculates Theoretical Quantity**: using `machine_product.cycle_time`.
    -   **Calculates Efficiency**: `actual / theoretical`.
    -   **Check Cost Recovery**: Compares production value vs `machine.daily_running_cost`.
    -   **Updates Stock**: Automatically creates a `semi_finished` stock entry in `Inventory` (or this might be a separate trigger/step depending on implementation details, usually it increments `semi_finished` stock).

### 3. Verify/Approve Log
-   **PUT** `/:id/verify`
-   **Auth**: Admin Only
-   **Body**: `{ "status": "verified" }`
-   **Description**: Locks the record from further editing.

### 4. Update Log (Correction)
-   **PUT** `/:id`
-   **Auth**: Admin/Production Manager (Only if status != `verified`)
-   **Description**: Allows correction of mistakes before verification.

## Complex Logic
-   **Cycle Time Lookup**: The controller/service must look up the correct `cycle_time` from the `machine_products` table to perform the theoretical calculation.
-   **Validation**: Ensures `shift_hours` does not exceed 24 (or 23 based on business rule).
