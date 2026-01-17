# Mobile App: API Reference

## Base Configuration
*   **Base URL:** Configured in `ApiConstants`. Currently `http://<server-ip>:4000/api`.
*   **Authentication:** All endpoints (except login) require `Authorization: Bearer <token>` header.

## Endpoints

### Authentication
*   **POST** `/auth/login`
    *   **Body:** `{ "email": "...", "password": "..." }`
    *   **Response:** `{ "user": {...}, "session": { "access_token": "..." } }`
*   **POST** `/auth/logout`

### Machines (Reference)
*   **GET** `/machines`
    *   **Description:** List all machines for dropdowns.
    *   **Permission:** `admin`, `production_manager`. *Fixed server-side to allow PM read access.*
    *   **Response Format (Important):** Returns a direct JSON Array `[{...}, {...}]`.
    *   **Client Handling:** `MasterDataRepository` detects `List` type to parsing.

### Products (Reference)
*   **GET** `/products`
    *   **Description:** List all products for dropdowns.
    *   **Permission:** `admin`, `production_manager`. *Fixed server-side to allow PM read access.*
    *   **Response Format (Important):** Returns a direct JSON Array `[{...}, {...}]`.

### Production
*   **POST** `/production/submit`
    *   **Description:** Submit a new daily production entry.
    *   **Body:**
        ```json
        {
          "machine_id": "uuid",
          "product_id": "uuid",
          "quantity": 100,
          "date": "2024-01-01" // ISO Date
        }
        ```
    *   **Permission:** `production_manager`.

### Inventory
*   **GET** `/inventory/stock`
    *   **Description:** Get aggregated stock counts.
    *   **Response:**
        ```json
        {
          "semiFinished": 1000,
          "packed": 500,
          "bundled": 200
        }
        ```
*   **POST** `/inventory/pack`
    *   **Description:** Convert Semi-Finished → Packed.
    *   **Body:** `{ "quantity": 100 }` (Amount produced/packed).
*   **POST** `/inventory/bundle`
    *   **Description:** Convert Packed → Finished (Bundles).
    *   **Body:** `{ "quantity": 50 }` (Amount bundled).

## Error Handling Standards
The mobile app handles standardized HTTP error codes:
*   **400 Bad Request:** Validation error or logic error (e.g., insufficient stock). Displays `error.message`.
*   **401 Unauthorized:** Invalid token. User must relogin.
*   **403 Forbidden:** Role permission issue. (Should not occur for PM on above endpoints).
*   **500 Internal Server Error:** Generic server failure.

## Troubleshooting
*   **Type Error (String vs Int):** If you see `type 'String' is not a subtype of type 'int'`, it is usually because the repository expects `{ "data": [...] }` but receives `[...]`. The `MasterDataRepository` has been patched to handle both formats.
