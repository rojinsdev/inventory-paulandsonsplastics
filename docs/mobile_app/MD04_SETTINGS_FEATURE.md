# Mobile App: Settings Feature

## Overview
The Settings feature manages app-wide configurations and user session controls. It provides access to theme preferences and logout functionality.

## Screens

### 1. More Screen (`MoreScreen`)
**Location:** `lib/features/settings/screens/more_screen.dart`
**Route:** `/more`

**UI Components:**
*   **Profile Card:** Displays User Name (if available) and Role (`production_manager`).
*   **Appearance Tile:**
    *   Displays current theme mode (Light/Dark/System).
    *   Tap triggers the **Theme Selector Bottom Sheet**.
*   **Logout Tile:** Red destructive action to sign out.
*   **About/Version:** App version information.

## Workflows

### 1. Theme Selection
1.  User taps "Appearance".
2.  **Bottom Sheet** opens with options:
    *   Light Mode
    *   Dark Mode
    *   System Default
3.  User selects an option.
4.  **State Update:** `themeModeProvider` updates the app-wide `ThemeMode`.
5.  **Persistence:** Preference is saved to `SharedPreferences` (key: `theme_mode`).
6.  **UI Refresh:** The app immediately rebuilds with the new theme colors.
7.  **Dark Mode Specifics:**
    *   Utilizes `ColorScheme.fromSeed(brightness: Brightness.dark)`.
    *   Text on cards uses `onSurface` colors to ensure visibility against dark backgrounds (fixed visibility bugs).

### 2. Logout
(See `MD01_AUTH_FEATURE.md` for details)

## Data Layer

### Providers
*   `themeModeProvider` (`StateNotifier<ThemeMode>`):
    *   **State:** The current `ThemeMode` enum.
    *   **Logic:**
        *   `loadTheme()`: Reads from storage on boot.
        *   `setTheme(mode)`: Updates memory state and writes to storage.

## UI/UX Details
*   **Bottom Sheet:** Uses `showModalBottomSheet` with rounded corners.
*   **Dynamic Colors:** All colors are derived from `Theme.of(context).colorScheme` to ensure consistency across light and dark modes.
