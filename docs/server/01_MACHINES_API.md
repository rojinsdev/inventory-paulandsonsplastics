# Machines API

## Base URL
`/api/machines`

## Module Description
Manages the "Machine Master" list. This module handles creating, reading, updating, and deleting production machines.

## Endpoints

### 1. List All Machines
-   **GET** `/`
-   **Auth**: Required (`admin`, `production_manager`)
-   **Description**: Retrieves a list of all machines.

### 2. Get Machine by ID
-   **GET** `/:id`
-   **Auth**: Required (`admin`, `production_manager`)
-   **Description**: Retrieves details of a specific machine.

### 3. Create Machine
-   **POST** `/`
-   **Auth**: Admin Only
-   **Body**:
    ```json
    {
      "name": "Extruder A",
      "type": "extruder",
      "category": "small",
      "daily_running_cost": 7000,
      "max_die_weight": 5.5 // optional
    }
    ```
-   **Validation**:
    -   `type` must be one of: `extruder`, `cutting`, `printing`, `packing`
    -   `category` must be one of: `small`, `large`, `other`
    -   `daily_running_cost` must be >= 0

### 4. Update Machine
-   **PUT** `/:id`
-   **Auth**: Admin Only
-   **Body**: Partial object of Create Body (e.g., update just `daily_running_cost`).

### 5. Delete Machine
-   **DELETE** `/:id`
-   **Auth**: Admin Only
-   **Description**: Deletes a machine.
-   **Error**: Returns `409 Conflict` if the machine has associated production history or products.

## Controller Logic (`MachineController`)
-   **Validation**: Uses `zod` schemas to strictly validate inputs before passing to the service.
-   **Service Layer**: Delegates DB operations to `machineService`.
-   **Error Handling**: Distinguishes between Zod errors (400) and operational errors (500).
