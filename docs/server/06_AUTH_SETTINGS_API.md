# Auth & Settings API

## 1. Authentication (`/api/auth`)

### Description
Handles user authentication. Note that most user management (sign up, roles) is handled directly via Supabase Console, but this endpoint facilitates login for the custom frontend/mobile apps if strictly needed, or just standard Supabase Auth client-side is used.
*Based on the current route file, it seems to handle basic check/health.*

### Endpoints
-   **GET** `/me`
-   **Auth**: Required
-   **Description**: Returns the current authenticated user's details and role.

## 2. Settings (`/api/settings`)

### Description
Manages global application configurations that are dynamic and stored in the database (e.g., `production_start_hour` or specific constants), if applicable.

### Endpoints
-   **GET** `/`
    -   **Auth**: Required
    -   **Description**: Get all settings.
-   **PUT** `/`
    -   **Auth**: Admin Only
    -   **Body**: `{ "key": "value" }`
    -   **Description**: Update global settings.

*(Note: If the `settings` module is empty or minimal in the codebase, this section reflects that structure.)*
