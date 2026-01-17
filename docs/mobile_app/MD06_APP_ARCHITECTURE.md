# Mobile App: Architecture & Logic

## Technology Stack
*   **Framework:** Flutter (Dart)
*   **State Management:** Riverpod (using `flutter_riverpod` and code generation compatible structure).
*   **Navigation:** GoRouter (`go_router`) for declarative routing.
*   **Networking:** Dio (`dio`) for HTTP requests.
*   **Persistence:** SharedPreferences (`shared_preferences`) for simple key-value storage (Tokens, Theme).

## Directory Structure (`apps/mobile/lib/`)
It follows a **Feature-First** architecture.

```
lib/
├── core/                  # shared logic, configs, theme, widgets
│   ├── api/               # Dio client, interceptors
│   ├── constants/         # ApiConstants, AssetConstants
│   ├── theme/             # AppTheme, Colors
│   └── widgets/           # Reusable UI components
├── features/              # Feature modules
│   ├── auth/              # Login, Session
│   │   ├── data/          # Repositories & Models
│   │   ├── providers/     # State Notifiers
│   │   └── screens/       # UI Screens
│   ├── inventory/         # Stock, Packing, Bundling
│   ├── production/        # Dashboard, Entry Form
│   └── settings/          # Theme, Profile
└── main.dart              # Entry point, App Config, Router
```

## Architectural Patterns

### 1. Repository Pattern
*   All API communication is encapsulated in **Repositories** (e.g., `AuthRepository`, `MasterDataRepository`).
*   Repositories are accessed via Providers (`authRepositoryProvider`).
*   Repositories return **Models**, parsing JSON data from `ApiClient`.

### 2. Provider Pattern (Riverpod)
*   **Logic Separation:** UI code does not make API calls directly. It watches Providers.
*   **State Notifiers:** Complex state (like Auth) uses `AsyncNotifier` or `StateNotifier`.
*   **Future Providers:** Simple data fetching (like stock summary) uses `FutureProvider`.

### 3. "Boring" Flutter Development (Safety First)
*   **Strict Typing:** Models use factory constructors and explicit typing.
*   **Error Handling:** UI listens to provider error states to show Feedback (Snackbars).
*   **Theme Awareness:** All UI widgets use `Theme.of(context)` references, never hardcoded colors, ensuring Dark Mode compatibility.

## Key Global Providers
*   `apiClientProvider`: The singleton Dio instance with interceptors.
*   `authStateProvider`: The global user session state.
*   `themeModeProvider`: The global visual theme state.
