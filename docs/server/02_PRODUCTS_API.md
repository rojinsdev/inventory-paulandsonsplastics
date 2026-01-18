# Products API

## Base URL
`/api/products`

## Module Description
Manages the "Product Master" list. This module handles creating, reading, updating, and deleting products. It also manages specific product attributes like weight, which is crucial for inventory calculations.

## Endpoints

### 1. List All Products
-   **GET** `/`
-   **Auth**: Required (`admin`, `production_manager`)
-   **Description**: Retrieves a list of all products.

### 2. Get Product by ID
-   **GET** `/:id`
-   **Auth**: Required (`admin`, `production_manager`)
-   **Description**: Retrieves details of a specific product.

### 3. Create Product
-   **POST** `/`
-   **Auth**: Admin Only
-   **Body**:
    ```json
    {
      "name": "1L Bottle",
      "sku": "BTL-1L-WHT", // optional but recommended
      "size": "1L",
      "color": "White",
      "weight_grams": 45.5,
      "items_per_packet": 100,
      "packets_per_bundle": 50
    }
    ```
-   **Validation**:
    -   `weight_grams`: must be > 0.
    -   `sku`: must be unique if provided.

### 4. Update Product
-   **PUT** `/:id`
-   **Auth**: Admin Only
-   **Body**: Partial object of Create Body.

### 5. Delete Product
-   **DELETE** `/:id`
-   **Auth**: Admin Only
-   **Description**: Deletes a product.
-   **Error**: Returns conflict if product is used in production logs or inventory.

## Services
-   **`productService`**: Handles DB interactions.
-   **(Implicit Relations)**: Products are linked to Machines via the `machine-products` (Die) table, but that is managed via a separate endpoint/module (`/api/machine-products`).
