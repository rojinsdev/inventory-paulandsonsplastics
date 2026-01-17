import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../auth/providers/auth_provider.dart';

/// Provider for theme mode with persistence
final themeModeProvider =
    StateNotifierProvider<ThemeModeNotifier, ThemeMode>((ref) {
  final prefs = ref.watch(sharedPreferencesProvider);
  return ThemeModeNotifier(prefs);
});

class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  final SharedPreferences _prefs;
  static const _key = 'theme_mode';

  ThemeModeNotifier(this._prefs) : super(ThemeMode.system) {
    _load();
  }

  void _load() {
    final value = _prefs.getString(_key);
    switch (value) {
      case 'light':
        state = ThemeMode.light;
        break;
      case 'dark':
        state = ThemeMode.dark;
        break;
      default:
        state = ThemeMode.system;
    }
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    state = mode;
    switch (mode) {
      case ThemeMode.light:
        await _prefs.setString(_key, 'light');
        break;
      case ThemeMode.dark:
        await _prefs.setString(_key, 'dark');
        break;
      case ThemeMode.system:
        await _prefs.setString(_key, 'system');
        break;
    }
  }
}
