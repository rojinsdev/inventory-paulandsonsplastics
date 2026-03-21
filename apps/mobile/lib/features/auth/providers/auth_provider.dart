import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../data/auth_repository.dart';
import '../data/user_model.dart';

import 'package:shared_preferences/shared_preferences.dart';

// Shared Preferences Provider (Initialized in main.dart)
final sharedPreferencesProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError();
});

// ApiClient Provider
final apiClientProvider = Provider<ApiClient>((ref) {
  final prefs = ref.watch(sharedPreferencesProvider);
  return ApiClient(prefs);
});

// Repository Provider
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final prefs = ref.watch(sharedPreferencesProvider);
  return AuthRepository(apiClient, prefs);
});

// State Provider
final authStateProvider =
    StateNotifierProvider<AuthNotifier, AsyncValue<User?>>((ref) {
  final repository = ref.watch(authRepositoryProvider);
  return AuthNotifier(repository);
});

class AuthNotifier extends StateNotifier<AsyncValue<User?>> with WidgetsBindingObserver {
  final AuthRepository _repository;
  StreamSubscription? _sessionSubscription;
  Timer? _refreshTimer;

  AuthNotifier(this._repository) : super(const AsyncValue.loading()) {
    // Register lifecycle observer
    WidgetsBinding.instance.addObserver(this);
    
    // Automatically try to restore session on creation
    _tryAutoLogin();

    // Listen for session expiration events from ApiClient -> Repository
    _sessionSubscription = _repository.onSessionExpired.listen((_) {
      // Force logout on session expiration
      state = const AsyncValue.data(null);
      _stopRefreshTimer();
    });
  }

  /// App Lifecycle check: Refresh if token is close to expiry when app comes to foreground
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      debugPrint('📱 App resumed: Checking session status...');
      _checkAndRefreshProactively();
    }
  }

  /// Attempt to restore session from stored token
  Future<void> _tryAutoLogin() async {
    try {
      final user = await _repository.tryAutoLogin();
      state = AsyncValue.data(user);
      if (user != null) {
        _startRefreshTimer();
      }
    } catch (e) {
      // If auto-login fails, just set state to null (not logged in)
      state = const AsyncValue.data(null);
    }
  }

  void _startRefreshTimer() {
    _stopRefreshTimer();
    // Check every 10 minutes while app is active
    _refreshTimer = Timer.periodic(const Duration(minutes: 10), (_) {
      _checkAndRefreshProactively();
    });
  }

  void _stopRefreshTimer() {
    _refreshTimer?.cancel();
    _refreshTimer = null;
  }

  Future<void> _checkAndRefreshProactively() async {
    if (state.asData?.value != null && _repository.isTokenExpired()) {
      debugPrint('🕒 Proactive Refresh Triggered: Token near expiry.');
      final success = await _repository.refreshSession();
      if (!success) {
        debugPrint('⚠️ Proactive refresh failed. Waiting for next request to trigger 401.');
      }
    }
  }

  Future<void> login(String email, String password) async {
    state = const AsyncValue.loading();
    try {
      final user = await _repository.login(email, password);
      state = AsyncValue.data(user);
      _startRefreshTimer();
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> logout() async {
    await _repository.logout();
    state = const AsyncValue.data(null);
    _stopRefreshTimer();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _sessionSubscription?.cancel();
    _stopRefreshTimer();
    super.dispose();
  }
}
