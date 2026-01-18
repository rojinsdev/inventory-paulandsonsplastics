# Server Overview

## Architecture
The server is a **Node.js** application written in **TypeScript**, using the **Express** framework. It follows a modular, resource-based architecture where each major domain (Machines, Products, etc.) has its own directory containing routes, controllers, and services.

### Tech Stack
-   **Runtime**: Node.js
-   **Language**: TypeScript
-   **Framework**: Express
-   **Database Integration**: Supabase JS Client (`@supabase/supabase-js`)
-   **Validation**: Zod
-   **Security**: Helmet, CORS
-   **Logging**: Morgan

## Directory Structure (`src/`)
-   **`app.ts`**: Main express application setup, middleware configuration, and route mounting.
-   **`server.ts`**: Entry point that starts the server listening on a port.
-   **`config/`**: Configuration files (Environment variables, Supabase client).
-   **`middleware/`**: Shared middleware (Authentication, Error handling).
-   **`modules/`**: Feature modules.
    -   `machines/`
    -   `products/`
    -   `production/`
    -   ...

## Configuration
The application is configured via environment variables loaded from a `.env` file.

| Variable | Description |
| :--- | :--- |
| `PORT` | The port the server runs on (Default: 4000). |
| `SUPABASE_URL` | The URL of the Supabase project. |
| `SUPABASE_KEY` | The generic API key (Service Role Key recommended for backend). |
| `NODE_ENV` | Environment (development/production). |

## Authentication
Authentication is handled via Supabase Auth tokens passed in the `Authorization` header (`Bearer <TOKEN>`).
-   **Middleware**: `authenticate` verifies the token.
-   **Role-Based Access**: `requireRole('admin', ...)` restricts access to specific routes based on the user's role (stored in Supabase).

## Error Handling
The server uses standard HTTP status codes:
-   `200/201`: Success
-   `400`: Bad Request (Validation Error)
-   `401`: Unauthorized (Missing/Invalid Token)
-   `403`: Forbidden (Insufficient Permissions)
-   `404`: Not Found
-   `409`: Conflict (e.g., duplicate unique field)
-   `500`: Internal Server Error
