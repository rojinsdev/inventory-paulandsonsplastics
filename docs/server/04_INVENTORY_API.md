# Inventory API

## Base URL
`/api/inventory`

## Module Description
Manages the physical stock of products through their lifecycle states (`semi_finished` -> `packed` -> `finished` -> `delivered`). This module is the source of truth for "Stock Balances" and handles all state transitions.

## Endpoints

### 1. Get Stock Balance
-   **GET** `/balance`
-   **Auth**: Required
-   **Description**: Retrieves current stock levels for all products in all states.

### 2. Transition Stock (Move State)
-   **POST** `/transition`
-   **Auth**: Required (Role depends on action, usually `production_manager`)
-   **Body**:
    ```json
    {
      "product_id": "uuid...",
      "from_state": "semi_finished",
      "to_state": "packed",
      "quantity": 500, // input quantity (e.g., 500 loose items)
      "note": "Packing Batch A"
    }
    ```
-   **Logic**:
    -   **Validation**: Checks if enough stock exists in `from_state`.
    -   **Conversion**: If moving `semi_finished` -> `packed`, it divides quantity by `items_per_packet`.
    -   If moving `packed` -> `finished`, it divides quantity by `packets_per_bundle`.
    -   **Transaction**: Creates a record in `inventory_transactions`.
    -   **Update**: Updates `stock_balances`.

### 3. Get Transaction History
-   **GET** `/transactions`
-   **Auth**: Required
-   **Description**: Returns a log of all stock movements for audit purposes.

### 4. Admin Correction
-   **POST** `/adjust`
-   **Auth**: Admin Only
-   **Body**: `{ "product_id": "...", "state": "...", "new_quantity": 100, "reason": "Audit Fix" }`
-   **Description**: Force-updates the stock balance (e.g., after physical stocktaking).

## Key Concepts
-   **State Machine**:
    1.  `semi_finished`: Loose items fresh from machine.
    2.  `packed`: Items in packets.
    3.  `finished`: Bundles/Sacks (Sellable).
    4.  `reserved`: Dedicated to an order.
    5.  `delivered`: Gone.
