import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/api/api_client.dart';
import '../../../core/constants/api_constants.dart';
import 'user_model.dart';

class AuthRepository {
  final ApiClient _apiClient;
  final SharedPreferences _storage;

  AuthRepository(this._apiClient, this._storage);

  Stream<void> get onSessionExpired => _apiClient.onSessionExpired;

  /// Try to auto-login using stored token
  Future<User?> tryAutoLogin() async {
    final token = _storage.getString('access_token');
    final userJson = _storage.getString('user_data');

    if (token == null || userJson == null) {
      return null; // No stored session
    }

    try {
      // 1. Check if token is expired locally first (proactive)
      if (isTokenExpired()) {
        debugPrint('🔄 Token expired locally, attempting proactive refresh...');
        final success = await refreshSession();
        if (!success) return null;
      }

      // 2. Validate the session with the server
      debugPrint('🔄 Verifying session with server...');
      final response = await _apiClient.client.get(ApiConstants.meEndpoint);

      if (response.statusCode == 200 && response.data != null) {
        // 3. Server confirmed validity. Update user data if needed.
        final userData = response.data['user'];
        final user = User.fromJson(userData);

        // Update stored user data to keep it fresh
        await _storage.setString('user_data', user.toJsonString());

        debugPrint('✅ Auto-login verified: ${user.email}');
        return user;
      } else {
        throw Exception('Invalid session');
      }
    } catch (e) {
      debugPrint('⚠️ Auto-login failed or session expired: $e');
      // 4. If verification fails (401 or connection error), clear session
      // This forces the user to login again ensuring a valid start state
      await logout();
      return null;
    }
  }

  Future<User> login(String email, String password) async {
    try {
      final response = await _apiClient.client.post(
        ApiConstants.loginEndpoint,
        data: {'email': email, 'password': password},
      );

      final data = response.data;

      // Debug: Log the response structure
      debugPrint('Login API Response: $data');

      // Validate response structure
      if (data == null) {
        throw Exception('Invalid response: response data is null');
      }

      // Server returns: { user: {...}, session: { access_token: "..." } }
      final session = data['session'];
      final token = session?['access_token'] ?? data['access_token'];
      final userJson = data['user'];

      debugPrint('Session: $session');
      debugPrint('Token: $token');
      debugPrint('User JSON: $userJson');

      // Validate token
      if (token == null || token is! String) {
        throw Exception(
            'Invalid response: access_token is missing or invalid.');
      }

      // Validate user data
      if (userJson == null || userJson is! Map<String, dynamic>) {
        throw Exception('Invalid response: user data is missing or invalid.');
      }

      // Store token and user data for auto-login
      await _storage.setString('access_token', token);

      final refreshToken = session?['refresh_token'] ?? data['refresh_token'];
      if (refreshToken != null) {
        await _storage.setString('refresh_token', refreshToken);
      }

      final expiresAt = session?['expires_at'] ?? data['expires_at'];
      if (expiresAt != null) {
        await _storage.setInt('expires_at', expiresAt is int ? expiresAt : int.parse(expiresAt.toString()));
      }

      final user = User.fromJson(userJson);
      await _storage.setString('user_data', user.toJsonString());

      return user;
    } catch (e) {
      if (e is DioException) {
        if (e.type == DioExceptionType.connectionTimeout ||
            e.type == DioExceptionType.receiveTimeout ||
            e.type == DioExceptionType.connectionError) {
          throw Exception(
              'Cannot connect to server. Please ensure the server is running.');
        }
        final errorMessage = e.response?.data['error'] ??
            e.response?.data['message'] ??
            'Login failed';
        throw Exception(errorMessage);
      }
      rethrow;
    }
  }

  Future<void> logout() async {
    await _storage.remove('access_token');
    await _storage.remove('refresh_token');
    await _storage.remove('expires_at');
    await _storage.remove('user_data');
  }

  Future<String?> getToken() async {
    return _storage.getString('access_token');
  }

  Future<String?> getRefreshToken() async {
    return _storage.getString('refresh_token');
  }

  bool isTokenExpired() {
    final expiresAt = _storage.getInt('expires_at');
    if (expiresAt == null) return true;

    // Current time in seconds (matching Supabase format)
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    
    // Proactive expiry: Consider it expired 5 minutes before it actually does
    return now > (expiresAt - 300); 
  }

  Future<bool> refreshSession() async {
    final refreshToken = _storage.getString('refresh_token');
    if (refreshToken == null) return false;

    try {
      final response = await _apiClient.client.post(
        '/api/auth/refresh',
        data: {'refresh_token': refreshToken},
      );

      if (response.statusCode == 200 && response.data != null) {
        final session = response.data['session'];
        final newToken = session?['access_token'];
        final newRefreshToken = session?['refresh_token'];
        final newExpiresAt = session?['expires_at'];

        if (newToken != null) {
          await _storage.setString('access_token', newToken);
          if (newRefreshToken != null) {
            await _storage.setString('refresh_token', newRefreshToken);
          }
          if (newExpiresAt != null) {
            await _storage.setInt('expires_at', newExpiresAt is int ? newExpiresAt : int.parse(newExpiresAt.toString()));
          }
          debugPrint('✅ Session refreshed successfully via proactive check');
          return true;
        }
      }
      return false;
    } catch (e) {
      debugPrint('❌ Proactive refresh failed: $e');
      return false;
    }
  }
}
