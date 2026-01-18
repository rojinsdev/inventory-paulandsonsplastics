# Sales API

## Base URL
`/api/sales-orders`

## Module Description
Manages the sales process, from order creation to delivery. It interacts tightly with the Inventory module to reserve stock (`finished` -> `reserved`) and finalize deliveries (`reserved` -> `delivered`).

## Endpoints

### 1. List Sales Orders
-   **GET** `/`
-   **Auth**: Admin Only
-   **Description**: List all orders.

### 2. Create Sales Order
-   **POST** `/`
-   **Auth**: Admin Only
-   **Body**:
    ```json
    {
      "customer_id": "uuid...",
      "items": [
        { "product_id": "uuid...", "quantity_bundles": 10 }
      ],
      "notes": "Urgent delivery"
    }
    ```
-   **Logic**:
    -   **Stock Check**: Verifies if 10 bundles of `finished` stock exist for that product.
    -   **Reservation**: Moves 10 bundles from `finished` to `reserved` in `inventory`.
    -   **Creation**: Creates `sales_order` and `sales_order_items`.

### 3. Mark as Delivered
-   **POST** `/:id/deliver`
-   **Auth**: Admin Only
-   **Description**: Completes the order.
-   **Logic**:
    -   Moves the reserved stock to `delivered` state (deducting it permanently).
    -   Updates order status to `delivered`.

### 4. Cancel Order
-   **POST** `/:id/cancel`
-   **Auth**: Admin Only
-   **Description**: Cancels the order.
-   **Logic**:
    -   Reverts stock from `reserved` back to `finished`.
    -   Updates order status to `cancelled`.

## Related API: Customers
Base URL: `/api/customers`
-   Standard CRUD (`GET /`, `POST /`, `PUT /:id`, `DELETE /:id`) for managing the client list.
