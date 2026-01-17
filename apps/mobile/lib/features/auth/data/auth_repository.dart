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

  /// Try to auto-login using stored token
  Future<User?> tryAutoLogin() async {
    final token = _storage.getString('access_token');
    final userJson = _storage.getString('user_data');

    if (token == null || userJson == null) {
      return null; // No stored session
    }

    // We have a stored token and user data, return the user
    // In a production app, you'd validate the token with the server here
    try {
      final user = User.fromJsonString(userJson);
      debugPrint('Auto-login successful for: ${user.email}');
      return user;
    } catch (e) {
      debugPrint('Auto-login failed: $e');
      // Clear invalid data
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
    await _storage.remove('user_data');
  }

  Future<String?> getToken() async {
    return _storage.getString('access_token');
  }
}
