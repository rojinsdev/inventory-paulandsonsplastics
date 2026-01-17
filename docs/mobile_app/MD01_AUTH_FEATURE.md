# Mobile App: Authentication Feature

## Overview
The Authentication feature manages user identity, session persistence, and access control within the mobile application. It ensures that only authorized **Production Managers** can access the app's core functionality.

## Screens

### 1. Login Screen (`LoginScreen`)
**Location:** `lib/features/auth/screens/login_screen.dart`
**Route:** `/login`

**UI Components:**
*   **Logo:** Large 200x200px company logo centered at the top.
*   **Form:** Email and Password input fields with validation.
*   **Submit Button:** "Login" button that triggers the authentication flow.
*   **Error Feedback:** Custom `SnackBar` with `errorContainer` styling (red background, error icon) to display API errors (e.g., "Invalid credentials", "Network error").

## Workflows

### 1. Manual Login
1.  User enters credentials (Email: `manager@paulandsons.com`, Password).
2.  App validates input format (e.g., valid email).
3.  Calls `AuthRepository.login(email, password)`.
4.  **On Success:**
    *   Tokens (Access/Refresh) and User Profile are stored in `SharedPreferences`.
    *   State is updated via `authStateProvider`.
    *   User is redirected to the Dashboard (`/`).
5.  **On Failure:**
    *   Error message from API is displayed in the custom SnackBar.

### 2. Auto-Login (Session Persistence)
**Mechanism:** `_tryAutoLogin()` in `AuthProvider`.

1.  App starts.
2.  `AuthProvider` initializes.
3.  Checks `SharedPreferences` for:
    *   `auth_token` (JWT)
    *   `user_data` (JSON string)
4.  **If found:** Restores user session immediately and redirects to Dashboard.
5.  **If not found:** Redirects to Login Screen.

### 3. Logout
1.  User taps "Logout" in Settings (`MoreScreen`).
2.  Calls `AuthRepository.logout()`.
3.  Clears all data from `SharedPreferences`.
4.  Resets UI state.
5.  Redirects to Login Screen.

## Data Layer

### Providers
*   `authStateProvider` (`AsyncNotifier<User?>`): Manages the current user's state.
*   `authRepositoryProvider`: Provides access to the `AuthRepository`.

### Repository (`AuthRepository`)
*   **Methods:**
    *   `login(email, password)`: POST to `/auth/login`.
    *   `logout()`: POST to `/auth/logout`, clears local storage.
    *   `tryAutoLogin()`: Restores session from local storage.

### Models
*   `User`: Represents the logged-in user.
    *   Fields: `id`, `email`, `role`.
    *   Methods: `fromJson`, `toJsonString`, `fromJsonString` (for local storage).

## Security
*   **Role Enforcement:** The app is designed for the `production_manager` role.
*   **Token Storage:** JWT tokens are stored locally on the device for session persistence.
*   **Secure Storage:** (Future Enhancement) Consider using `flutter_secure_storage` for more sensitive data.
